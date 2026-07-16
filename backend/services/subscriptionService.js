const Subscription = require("../models/Subscription");
const User = require("../models/User");
const BusinessOwnerAccount = require("../models/BusinessOwnerAccount");
const { TRIAL_DAYS, EXPIRY_REMINDER_DAYS, GRACE_PERIOD_DAYS, BILLING_INTERVAL_DAYS } = require("../config/subscription");
const { sendEmail } = require("./emailService");
const { getContact } = require("./platformConfigService");

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_BUSINESS_LIMIT = 1;

const createHttpError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

// Pure — no DB access, no side effects. Expiry/grace are always DERIVED from
// currentPeriodEnd rather than a persisted status flip (see Subscription.js's
// comment) — this is the one function that computes what that means at any
// given instant, exactly like Voucher's `expiresAt && expiresAt < now` check
// inline in voucherService, just factored out since it's needed in more
// places here (gating, the reminder banner, the platform admin view).
const computeEffectiveStatus = (subscription, now = new Date()) => {
  if (!subscription) return "none";
  if (subscription.status === "canceled") return "canceled";

  const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
  const graceEnd = periodEnd + GRACE_PERIOD_DAYS * DAY_MS;
  const nowMs = now.getTime();

  if (nowMs <= periodEnd) return subscription.status; // "trialing" or "active"
  if (nowMs <= graceEnd) return "grace";
  return "expired";
};

// Can this owner still take owner-tier actions (add a business)? "grace" is
// deliberately still allowed — it exists specifically to absorb the lag of
// manual, no-auto-charge renewal. Only "expired"/"canceled" block.
const isOwnerTierActive = (effectiveStatus) => effectiveStatus === "trialing" || effectiveStatus === "active" || effectiveStatus === "grace";

const getSubscription = async (ownerAccountId) => {
  return Subscription.findOne({ ownerAccountId });
};

// Called once, right after a BusinessOwnerAccount is created — see
// ownerAccountService.registerOwnerAccount. Gives every new self-serve owner
// exactly one business for TRIAL_DAYS with no plan/payment required yet
// (honors "Start free. Scale as you grow." without a separate Rs 0 plan —
// see plan doc D3).
const startTrialSubscription = async (ownerAccountId) => {
  const now = new Date();
  return Subscription.create({
    ownerAccountId,
    planId: null,
    planSlug: "trial",
    status: "trialing",
    businessLimitAtPurchase: TRIAL_BUSINESS_LIMIT,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
    isComped: false
  });
};

const countOwnerBusinesses = async (ownerAccountId) => {
  const memberships = await User.find({ ownerAccountId, role: "business_admin" });
  return memberships.length;
};

// The real server-side gate — mirrors how isPlatformOwner already gates
// platform writes, except this is data-driven (a business count vs a
// snapshotted limit) rather than role-driven, so it lives in the service
// layer and is called explicitly by whatever tries to create a business,
// not wired as route middleware.
const assertCanAddBusiness = async (ownerAccountId) => {
  const subscription = await getSubscription(ownerAccountId);
  if (!subscription) {
    throw createHttpError("No subscription found for this account.", 402, "NO_SUBSCRIPTION");
  }

  const effectiveStatus = computeEffectiveStatus(subscription);
  if (!isOwnerTierActive(effectiveStatus)) {
    throw createHttpError(
      "Your subscription has expired. Renew to add another business.",
      402,
      "SUBSCRIPTION_EXPIRED"
    );
  }

  const businessCount = await countOwnerBusinesses(ownerAccountId);
  if (businessCount >= subscription.businessLimitAtPurchase) {
    throw createHttpError(
      `Your plan allows ${subscription.businessLimitAtPurchase} business${subscription.businessLimitAtPurchase === 1 ? "" : "es"}. Upgrade to add another.`,
      402,
      "BUSINESS_LIMIT_REACHED"
    );
  }

  return { subscription, businessCount };
};

// Downgrade-over-limit rule: an owner can never move to a plan whose
// businessLimit is below how many businesses they already run — checked
// BEFORE initiating checkout (see paymentService in Phase 4), so they're
// never left in an impossible state where a payment succeeded but the
// subscription can't actually represent their existing business count.
const assertPlanChangeAllowed = async (ownerAccountId, plan) => {
  const businessCount = await countOwnerBusinesses(ownerAccountId);
  if (plan.businessLimit < businessCount) {
    throw createHttpError(
      `You currently run ${businessCount} businesses — the "${plan.name}" plan only allows ${plan.businessLimit}. Remove businesses first, or pick a higher plan.`,
      400,
      "PLAN_BELOW_CURRENT_USAGE"
    );
  }
};

// Extends/activates a subscription after a successful payment verification
// (Phase 4). Renewing before expiry extends from the CURRENT period end
// (not from "now"), so paying early never costs the owner days they already
// paid for; renewing after expiry (including during grace) starts fresh
// from now.
const applyPurchase = async ({ ownerAccountId, plan }) => {
  await assertPlanChangeAllowed(ownerAccountId, plan);

  const subscription = await getSubscription(ownerAccountId);
  const now = new Date();
  const periodStart = subscription && new Date(subscription.currentPeriodEnd).getTime() > now.getTime()
    ? new Date(subscription.currentPeriodEnd)
    : now;
  const periodEnd = new Date(periodStart.getTime() + (plan.billingIntervalDays || BILLING_INTERVAL_DAYS) * DAY_MS);

  const updates = {
    planId: plan.id,
    planSlug: plan.slug,
    status: "active",
    businessLimitAtPurchase: plan.businessLimit,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    isComped: false,
    updatedAt: now
  };

  if (subscription) {
    return Subscription.findOneAndUpdate({ _id: subscription._id }, { $set: updates }, { new: true });
  }
  return Subscription.create({ ownerAccountId, ...updates });
};

// How many whole days until currentPeriodEnd (negative once past it — used
// to phrase the reminder as "renews in N days" or "expired N days ago").
const daysUntil = (date, now = new Date()) =>
  Math.ceil((new Date(date).getTime() - now.getTime()) / DAY_MS);

const computeReminder = (subscription) => {
  if (!subscription) return { show: false };
  const daysLeft = daysUntil(subscription.currentPeriodEnd);
  return { show: daysLeft <= EXPIRY_REMINDER_DAYS, daysLeft };
};

// Sends the renewal-reminder email at most once per billing cycle — no cron
// exists (or is needed): this runs inline the next time the subscription is
// read (getSubscriptionSummary, called by both the owner dashboard and the
// tenant-admin Subscription page) after crossing EXPIRY_REMINDER_DAYS.
// reminderEmailSentAt is compared against currentPeriodStart so a renewal
// correctly re-arms it for the following cycle instead of never firing
// again. Includes the platform's own contact info (reused from
// platformConfigService's singleton, the same info already shown on the
// public platform contact page) since renewal here is a manual, out-of-band,
// key-based process — the business needs to know who to actually call.
const maybeSendReminderEmail = async (subscription) => {
  if (!subscription) return;

  const reminder = computeReminder(subscription);
  if (!reminder.show) return;

  const alreadySentThisCycle =
    subscription.reminderEmailSentAt &&
    new Date(subscription.reminderEmailSentAt).getTime() >= new Date(subscription.currentPeriodStart).getTime();
  if (alreadySentThisCycle) return;

  const account = await BusinessOwnerAccount.findOne({ _id: subscription.ownerAccountId });
  if (!account) return;

  const contact = await getContact();
  const contactLine = [contact.phone, contact.email].filter(Boolean).join(" or ");
  const whenPhrase = reminder.daysLeft >= 0
    ? `in ${reminder.daysLeft} day${reminder.daysLeft === 1 ? "" : "s"}`
    : `${Math.abs(reminder.daysLeft)} day${Math.abs(reminder.daysLeft) === 1 ? "" : "s"} ago`;

  await sendEmail({
    to: account.email,
    subject: "Your Stampd subscription is expiring soon",
    html: `<p>Your subscription expires ${whenPhrase}. Renewal is handled manually — contact us${contactLine ? ` at ${contactLine}` : ""} to arrange payment and receive a new activation key.</p>`
  });

  await Subscription.findOneAndUpdate(
    { _id: subscription._id },
    { $set: { reminderEmailSentAt: new Date() } }
  );
};

const formatSubscription = async (subscription) => {
  if (!subscription) return null;
  const businessCount = await countOwnerBusinesses(subscription.ownerAccountId);
  return {
    planSlug: subscription.planSlug,
    status: subscription.status,
    effectiveStatus: computeEffectiveStatus(subscription),
    businessLimitAtPurchase: subscription.businessLimitAtPurchase,
    businessCount,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    daysUntilExpiry: daysUntil(subscription.currentPeriodEnd),
    isComped: subscription.isComped
  };
};

// Full summary for the owner dashboard / tenant-admin Subscription page.
// Fires the lazy renewal-reminder email as a side effect of being read
// (see maybeSendReminderEmail) and always includes the platform's contact
// info alongside the reminder — the business needs to know who to reach out
// to for a manual, key-based renewal regardless of whether the reminder is
// currently showing.
const getSubscriptionSummary = async (ownerAccountId) => {
  const subscription = await getSubscription(ownerAccountId);
  await maybeSendReminderEmail(subscription);

  const contact = await getContact();
  return {
    success: true,
    subscription: await formatSubscription(subscription),
    reminder: computeReminder(subscription),
    platformContact: { phone: contact.phone, email: contact.email }
  };
};

module.exports = {
  createHttpError,
  computeEffectiveStatus,
  isOwnerTierActive,
  getSubscription,
  startTrialSubscription,
  countOwnerBusinesses,
  assertCanAddBusiness,
  assertPlanChangeAllowed,
  applyPurchase,
  computeReminder,
  formatSubscription,
  getSubscriptionSummary
};
