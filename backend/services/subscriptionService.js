const Subscription = require("../models/Subscription");
const Organization = require("../models/Organization");
const AdminAccount = require("../models/AdminAccount");
const { TRIAL_DAYS, EXPIRY_REMINDER_DAYS, GRACE_PERIOD_DAYS, BILLING_INTERVAL_DAYS } = require("../config/subscription");
const { sendEmail } = require("./emailService");
const { getContact } = require("./platformConfigService");

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_OUTLET_LIMIT = 1;

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
const isCompanyTierActive = (effectiveStatus) => effectiveStatus === "trialing" || effectiveStatus === "active" || effectiveStatus === "grace";

const getSubscription = async (companyId) => {
  return Subscription.findOne({ companyId });
};

// Called once, right after a Company is registered. Gives it exactly one
// outlet for TRIAL_DAYS with no plan/payment required yet — honors "Start
// free. Scale as you grow." without needing a separate Rs 0 plan.
const startTrialSubscription = async (companyId) => {
  const now = new Date();
  return Subscription.create({
    companyId,
    planId: null,
    planSlug: "trial",
    status: "trialing",
    outletLimitAtPurchase: TRIAL_OUTLET_LIMIT,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
    isComped: false
  });
};

// Counts the outlets a company's plan is actually paying for. Archived
// (soft-deleted) outlets are excluded — archiving frees the slot, which is
// the whole point of offering it instead of a destructive delete. Counts
// Organizations directly rather than joining through admin memberships, so
// an outlet with no admin yet still occupies its slot.
const countCompanyOutlets = async (companyId) => {
  const outlets = await Organization.find({ companyId });
  return outlets.filter((o) => o.status !== "archived").length;
};

// The real server-side gate — mirrors how isPlatformOwner gates platform
// writes, except this is data-driven (an outlet count vs a snapshotted
// limit) rather than role-driven, so it lives in the service layer and is
// called explicitly by whatever tries to create an outlet, not wired as
// route middleware.
const assertCanAddOutlet = async (companyId) => {
  const subscription = await getSubscription(companyId);
  if (!subscription) {
    throw createHttpError("No subscription found for this company.", 402, "NO_SUBSCRIPTION");
  }

  const effectiveStatus = computeEffectiveStatus(subscription);
  if (!isCompanyTierActive(effectiveStatus)) {
    throw createHttpError(
      "Your subscription has expired. Renew to add another outlet.",
      402,
      "SUBSCRIPTION_EXPIRED"
    );
  }

  const outletCount = await countCompanyOutlets(companyId);
  if (outletCount >= subscription.outletLimitAtPurchase) {
    throw createHttpError(
      `Your plan allows ${subscription.outletLimitAtPurchase} outlet${subscription.outletLimitAtPurchase === 1 ? "" : "s"}. Upgrade to add another.`,
      402,
      "OUTLET_LIMIT_REACHED"
    );
  }

  return { subscription, outletCount };
};

// Downgrade-over-limit rule: a company can never move to a plan whose
// outletLimit is below how many outlets it already runs — checked BEFORE
// applying an activation key, so it's never left in an impossible state
// where the subscription can't represent its existing outlet count.
const assertPlanChangeAllowed = async (companyId, plan) => {
  const outletCount = await countCompanyOutlets(companyId);
  if (plan.outletLimit < outletCount) {
    throw createHttpError(
      `You currently run ${outletCount} outlets — the "${plan.name}" plan only allows ${plan.outletLimit}. Archive an outlet first, or pick a higher plan.`,
      400,
      "PLAN_BELOW_CURRENT_USAGE"
    );
  }
};

// Extends/activates a subscription once an activation key is redeemed.
// Renewing before expiry extends from the CURRENT period end (not from
// "now"), so redeeming early never costs the company days it already paid
// for; renewing after expiry (including during grace) starts fresh from now.
const applyPurchase = async ({ companyId, plan }) => {
  await assertPlanChangeAllowed(companyId, plan);

  const subscription = await getSubscription(companyId);
  const now = new Date();
  const periodStart = subscription && new Date(subscription.currentPeriodEnd).getTime() > now.getTime()
    ? new Date(subscription.currentPeriodEnd)
    : now;
  const periodEnd = new Date(periodStart.getTime() + (plan.billingIntervalDays || BILLING_INTERVAL_DAYS) * DAY_MS);

  const updates = {
    planId: plan.id,
    planSlug: plan.slug,
    status: "active",
    outletLimitAtPurchase: plan.outletLimit,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    isComped: false,
    updatedAt: now
  };

  if (subscription) {
    return Subscription.findOneAndUpdate({ _id: subscription._id }, { $set: updates }, { new: true });
  }
  return Subscription.create({ companyId, ...updates });
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

  // The company entity holds no email — its owner's AdminAccount does.
  const owner = await AdminAccount.findOne({ companyId: subscription.companyId, kind: "company_owner" });
  if (!owner) return;

  const contact = await getContact();
  const contactLine = [contact.phone, contact.email].filter(Boolean).join(" or ");
  const whenPhrase = reminder.daysLeft >= 0
    ? `in ${reminder.daysLeft} day${reminder.daysLeft === 1 ? "" : "s"}`
    : `${Math.abs(reminder.daysLeft)} day${Math.abs(reminder.daysLeft) === 1 ? "" : "s"} ago`;

  await sendEmail({
    to: owner.email,
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
  const outletCount = await countCompanyOutlets(subscription.companyId);
  return {
    planSlug: subscription.planSlug,
    status: subscription.status,
    effectiveStatus: computeEffectiveStatus(subscription),
    outletLimitAtPurchase: subscription.outletLimitAtPurchase,
    outletCount,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    daysUntilExpiry: daysUntil(subscription.currentPeriodEnd),
    isComped: subscription.isComped
  };
};

// Full summary for the company console's Subscription page. Fires the lazy
// renewal-reminder email as a side effect of being read (see
// maybeSendReminderEmail) and always includes the platform's contact info
// alongside the reminder — the company needs to know who to reach out to for
// a manual, key-based renewal regardless of whether the reminder is showing.
const getSubscriptionSummary = async (companyId) => {
  const subscription = await getSubscription(companyId);
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
  isCompanyTierActive,
  getSubscription,
  startTrialSubscription,
  countCompanyOutlets,
  assertCanAddOutlet,
  assertPlanChangeAllowed,
  applyPurchase,
  computeReminder,
  formatSubscription,
  getSubscriptionSummary
};
