const { sendEmail } = require("./emailService");
const MessageLog = require("../models/MessageLog");
const PointsTransaction = require("../models/PointsTransaction");
const CustomerAccount = require("../models/CustomerAccount");
const Organization = require("../models/Organization");
const User = require("../models/User");
const PointsBalance = require("../models/PointsBalance");
const { toPoints } = require("../utils/pointsMath");
const { PLATFORM_TIMEZONE, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = require("../config/platform");
const webpush = require("web-push");
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
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
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

const sendTrigger = async (type, { organization, customer, membership, context = {} }) => {
  const { subject, html } = renderTemplate(type, { organization, customer, context });
  let sent = false;

  if (customer.marketingConsent?.email?.granted) {
    sendEmail({ to: customer.email, subject, html })
      .catch((err) => console.error(`Failed to send ${type} trigger to ${customer.email}:`, err.message));
    sent = true;
  }

  if (customer.marketingConsent?.push?.granted) {
    const subscriptions = await PushSubscription.find({ customerAccountId: customer._id });
    for (const sub of subscriptions) {
      sendPushToSubscription(sub, { title: subject, body: stripHtml(html) });
    }
    if (subscriptions.length > 0) sent = true;
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

const runBirthdayTriggerForOrg = async (org, todayMonth, todayDay) => {
  const members = await User.find({ role: "customer", organizationId: org._id });
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  for (const member of members) {
    if (!member.customerAccountId) continue;
    const customer = await CustomerAccount.findOne({ _id: member.customerAccountId });
    if (!customer) continue;
    if (customer.birthdayMonth !== todayMonth || customer.birthdayDay !== todayDay) continue;

    const alreadySent = await MessageLog.findOne({
      organizationId: org._id,
      userId: member._id,
      triggerType: "birthday",
      sentAt: { $gte: yearStart }
    });
    if (alreadySent) continue;

    await sendTrigger("birthday", { organization: org, customer, membership: member, context: {} });
  }
};

const runInactivityTriggerForOrg = async (org, days) => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cooldownStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const balances = await PointsBalance.find({ organizationId: org._id });
  const inactiveBalances = balances.filter(
    (b) => b.lastActivityAt && new Date(b.lastActivityAt).getTime() <= cutoff.getTime()
  );

  for (const balance of inactiveBalances) {
    const member = await User.findOne({ _id: balance.userId, organizationId: org._id });
    if (!member || !member.customerAccountId) continue;
    const customer = await CustomerAccount.findOne({ _id: member.customerAccountId });
    if (!customer) continue;

    const alreadySent = await MessageLog.findOne({
      organizationId: org._id,
      userId: member._id,
      triggerType: "inactivity",
      sentAt: { $gte: cooldownStart }
    });
    if (alreadySent) continue;

    await sendTrigger("inactivity", {
      organization: org,
      customer,
      membership: member,
      context: { balance: toPoints(balance.balanceCenti), days }
    });
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

module.exports = { sendTrigger, sendPushToSubscription, checkMilestoneTrigger, runDailyTriggers };
