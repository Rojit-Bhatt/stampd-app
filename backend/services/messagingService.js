const { sendEmail } = require("./emailService");
const { sendSms } = require("./smsService");
const MessageLog = require("../models/MessageLog");
const PointsTransaction = require("../models/PointsTransaction");
const CustomerAccount = require("../models/CustomerAccount");
const Organization = require("../models/Organization");
const User = require("../models/User");
const PointsBalance = require("../models/PointsBalance");
const { toPoints } = require("../utils/pointsMath");
const { PLATFORM_TIMEZONE, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = require("../config/platform");
const webpush = require("web-push");
const { pushNotificationBreaker } = require("../utils/dependencyBreakers");
const PushSubscription = require("../models/PushSubscription");

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const renderTemplate = (type, { organization, customer, context }) => {
  if (type === "milestone") {
    return {
      subject: `You've visited ${organization.name} ${context.visitCount} times!`,
      html: `<p>Hi ${customer.name}, that's ${context.visitCount} visits to ${organization.name} — thanks for being a regular. See you again soon.</p>`
    };
  }
  if (type === "birthday") {
    return {
      subject: `Happy birthday from ${organization.name}!`,
      html: `<p>Hi ${customer.name}, happy birthday from all of us at ${organization.name}. Hope it's a good one — come by and treat yourself.</p>`
    };
  }
  if (type === "inactivity") {
    return {
      subject: `We miss you at ${organization.name}`,
      html: `<p>Hi ${customer.name}, it's been a while since your last visit to ${organization.name}. You've still got ${context.balance} points waiting — come say hi.</p>`
    };
  }
  throw new Error(`Unknown trigger type: ${type}`);
};

const stripHtml = (html) => html.replace(/<[^>]+>/g, "");

// Never rejects — every failure path (dead subscription or anything else)
// is handled internally, so callers can fire this without a .catch().
// Returns {ok} so a caller that needs real delivery status
// (broadcastService's evaluateBroadcasts) can tell success from failure;
// existing trigger callers (sendTrigger below) ignore the return value
// exactly as before.
const sendPushToSubscription = async (sub, payload) => {
  try {
    // Circuit-broken: a slow or dead push endpoint fast-fails instead of
    // hanging, and repeated failures open the circuit for the whole
    // dependency so the trigger loops stop wasting sends on it.
    await pushNotificationBreaker.exec(async () =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload))
    );
    return { ok: true };
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await PushSubscription.deleteOne({ _id: sub._id });
    } else {
      console.error("Failed to send push notification:", err.message);
    }
    return { ok: false };
  }
};

// Batched daily-trigger entry point: preloads the org's push subscriptions
// (one find for the whole org, keyed by customerAccountId) so the per-user
// loop sends push without a round trip per customer. Milestone callers
// (sendTrigger below) keep the per-call find — a single push lookup for
// one customer is cheap and milestone fires once per customer anyway.
const sendTriggersBatch = async (type, { organization, customers }) => {
  const subsByAccount = new Map();
  const accountIds = customers
    .map((e) => e.customer && e.customer._id)
    .filter((id) => id !== undefined && id !== null);
  if (accountIds.length > 0) {
    const subs = await PushSubscription.find({ customerAccountId: { $in: accountIds } });
    for (const sub of subs) {
      const key = sub.customerAccountId.toString();
      const list = subsByAccount.get(key) || [];
      list.push(sub);
      subsByAccount.set(key, list);
    }
  }
  const results = [];
  for (const entry of customers) {
    // Callers pass entries as { customer, membership, context } — guard the
    // shape explicitly instead of reading _id off whatever "customer" means.
    const account = entry.customer;
    if (!account || !account._id) continue;
    const subs = subsByAccount.get(account._id.toString()) || [];
    const result = await sendTrigger(type, {
      organization,
      customer: account,
      membership: entry.membership,
      context: entry.context || {},
      pushSubscriptions: subs
    });
    results.push(result);
  }
  return results;
};

const sendTrigger = async (type, { organization, customer, membership, context = {}, pushSubscriptions = null }) => {
  const { subject, html } = renderTemplate(type, { organization, customer, context });
  let sent = false;

  if (customer.marketingConsent?.email?.granted) {
    sendEmail({ to: customer.email, subject, html })
      .catch((err) => console.error(`Failed to send ${type} trigger to ${customer.email}:`, err.message));
    sent = true;
  }

  if (customer.marketingConsent?.push?.granted) {
    // Preloaded by sendTriggersBatch for the batched daily-trigger path —
    // falls back to the per-user find for single-call milestone sends.
    const subscriptions = pushSubscriptions !== null
      ? pushSubscriptions
      : await PushSubscription.find({ customerAccountId: customer._id });
    for (const sub of subscriptions) {
      sendPushToSubscription(sub, { title: subject, body: stripHtml(html) });
    }
    if (subscriptions.length > 0) sent = true;
  }

  // Awaited (unlike email/push above) because smsService's cap check must
  // resolve before this function can know whether to count it as sent —
  // there's no fire-and-forget shortcut for "was this within budget."
  if (customer.marketingConsent?.sms?.granted) {
    const result = await sendSms({
      companyId: organization.companyId,
      organizationId: organization._id,
      to: customer.phone,
      text: stripHtml(html)
    });
    if (result.sent) sent = true;
  }

  if (!sent) {
    return { sent: false, reason: "no_consent" };
  }

  await MessageLog.create({ organizationId: organization._id, userId: membership._id, triggerType: type });
  return { sent: true };
};

const checkMilestoneTrigger = async ({ organization, membership }) => {
  const visitCount = organization.messagingTriggers?.milestone?.visitCount;
  if (visitCount === null || visitCount === undefined) return;

  const earns = await PointsTransaction.countDocuments({
    organizationId: organization._id,
    userId: membership._id,
    type: "earn"
  });
  if (earns !== visitCount) return;

  if (!membership.customerAccountId) return;
  const customer = await CustomerAccount.findOne({ _id: membership.customerAccountId });
  if (!customer) return;

  await sendTrigger("milestone", { organization, customer, membership, context: { visitCount } });
};

const todayInPlatformTimezone = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLATFORM_TIMEZONE,
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());
  return {
    month: Number(parts.find((p) => p.type === "month").value),
    day: Number(parts.find((p) => p.type === "day").value)
  };
};

// Batch birthday lookup: instead of scanning every membership then querying
// the CustomerAccount one at a time, ask for the (month, day) combinations
// that are actually today and collect the qualifying memberships in a
// single $in pass. The MessageLog idempotency guard uses a single $in too.
// Batch birthday lookup: instead of scanning every membership then querying
// the CustomerAccount one at a time, ask for the (month, day) combinations
// that are actually today and collect the qualifying memberships in a
// single $in pass. The MessageLog idempotency guard uses a single $in too,
// and push subscriptions are fetched once for the whole eligible set.
const runBirthdayTriggerForOrg = async (org, todayMonth, todayDay) => {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const members = await User.find({ role: "customer", organizationId: org._id });
  const accountIds = members.filter((m) => m.customerAccountId).map((m) => m.customerAccountId);
  if (accountIds.length === 0) return;
  const accounts = await CustomerAccount.find({ _id: { $in: accountIds } });
  const accountById = new Map(accounts.map((a) => [a._id.toString(), a]));
  const eligible = members
    .filter((m) => {
      const a = accountById.get(m.customerAccountId.toString());
      return a && a.birthdayMonth === todayMonth && a.birthdayDay === todayDay;
    })
    .map((m) => ({ customer: accountById.get(m.customerAccountId.toString()), membership: m, context: {} }));
  if (eligible.length === 0) return;

  const alreadySent = await MessageLog.find({
    organizationId: org._id,
    userId: { $in: eligible.map((e) => e.membership._id) },
    triggerType: "birthday",
    sentAt: { $gte: yearStart }
  });
  const sentByUser = new Set(alreadySent.map((l) => l.userId.toString()));
  const unsent = eligible.filter((e) => !sentByUser.has(e.membership._id.toString()));

  if (unsent.length > 0) {
    await sendTriggersBatch("birthday", { organization: org, customers: unsent });
  }
};

// Batch inactivity lookup: memberships and balances are joined in memory
// (single read each, keyed by userId), and the idempotency guard uses one
// $in query instead of one per user. Only the sends (email/push/sms — they
// must stay per-user for consent + personalization) remain a loop.
// Batch inactivity lookup: memberships and balances are joined in memory
// (single read each, keyed by userId), and the idempotency guard uses one
// $in query instead of one per user. Only the sends (email/push/sms — they
// must stay per-user for consent + personalization) remain a loop, and
// even push subscriptions are fetched once for the whole eligible set.
const runInactivityTriggerForOrg = async (org, days) => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cooldownStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const members = await User.find({ role: "customer", organizationId: org._id });
  const balances = await PointsBalance.find({ organizationId: org._id });
  const balanceByUser = new Map(balances.map((b) => [b.userId.toString(), b]));

  const inactive = members
    .filter((m) => m.customerAccountId)
    .map((m) => ({ member: m, balance: balanceByUser.get(m._id.toString()) }))
    .filter(({ balance }) => balance && balance.lastActivityAt && new Date(balance.lastActivityAt).getTime() <= cutoff.getTime());
  if (inactive.length === 0) return;

  const accountIds = [...new Set(inactive.map(({ member }) => member.customerAccountId.toString()))];
  const accounts = await CustomerAccount.find({ _id: { $in: accountIds } });
  const accountById = new Map(accounts.map((a) => [a._id.toString(), a]));

  const alreadySent = await MessageLog.find({
    organizationId: org._id,
    userId: { $in: inactive.map(({ member }) => member._id) },
    triggerType: "inactivity",
    sentAt: { $gte: cooldownStart }
  });
  const sentByUser = new Set(alreadySent.map((l) => l.userId.toString()));

    const unsent = inactive
    .filter(({ member }) => !sentByUser.has(member._id.toString()))
    .filter(({ member }) => accountById.has(member.customerAccountId.toString()))
    .map(({ member, balance }) => ({
      customer: accountById.get(member.customerAccountId.toString()),
      membership: member,
      context: { balance: toPoints(balance.balanceCenti), days }
    }));
  if (unsent.length > 0) {
    await sendTriggersBatch("inactivity", { organization: org, customers: unsent });
  }
};

const runDailyTriggers = async () => {
  const { month: todayMonth, day: todayDay } = todayInPlatformTimezone();
  const orgs = await Organization.find({});

  for (const org of orgs) {
    if (org.messagingTriggers?.birthday?.enabled) {
      await runBirthdayTriggerForOrg(org, todayMonth, todayDay);
    }
    const inactivityDays = org.messagingTriggers?.inactivity?.days;
    if (inactivityDays !== null && inactivityDays !== undefined) {
      await runInactivityTriggerForOrg(org, inactivityDays);
    }
  }
};

module.exports = { sendTrigger, sendTriggersBatch, sendPushToSubscription, checkMilestoneTrigger, runDailyTriggers };
