const User = require("../models/User");
const Campaign = require("../models/Campaign");
const Organization = require("../models/Organization");
const Subscription = require("../models/Subscription");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const PointsTransaction = require("../models/PointsTransaction");

// "Has this been worth it?" — the value counterpart to reportService, which
// answers "what happened?".
//
// Everything here is derived at read time from the ledger. Nothing is stored,
// nothing is scheduled, and nothing is estimated: a figure with no source in
// the data does not appear on this page. That rules out the staff-hours and
// operations-cost tiles a competitor's version of this page carries — they
// are a coefficient somebody picked, not a measurement.
//
// All-time by design. Impact is cumulative ("since I started"), so it takes
// no date range; the range-filtered view of the same flows already lives on
// the Reports pages.
//
// Fetched and reduced in JS rather than aggregated, because the mock DB has
// no aggregation pipeline — the same approach reportService already takes.

const round2 = (n) => Math.round(n * 100) / 100;

// One pass over an outlet's ledger.
//
// Earns are grouped by ACCOUNT, not by membership row: the key is
// customerAccountId when there is one, so getCompanyImpact can merge the
// same person across sibling outlets without double-counting them. Falls
// back to the User id for a legacy membership with no global account.
//
// `since` limits revenueSince only — every other figure stays all-time. It
// exists for the ROI block, which must measure revenue over the same window
// as the cost it is divided by.
const collectOutletFacts = async (organizationId, { since = null } = {}) => {
  const [txns, memberships] = await Promise.all([
    PointsTransaction.find({ organizationId }),
    User.find({ organizationId, role: "customer" })
  ]);

  const accountKeyByUserId = new Map();
  for (const m of memberships) {
    accountKeyByUserId.set(
      m._id.toString(),
      m.customerAccountId ? m.customerAccountId.toString() : m._id.toString()
    );
  }

  const earnsByAccount = new Map();
  // Distinct calendar days (UTC) with any transaction, earn or redeem,
  // per account. This drives the repeat-customer definition below:
  // a customer has "come back" once they appear on a second day, however
  // the activity on those days was split between earning and redeeming.
  const activityDaysByAccount = new Map();
  let revenueTracked = 0;
  let revenueSince = 0;
  let redemptionCount = 0;
  let rewardValueRedeemed = 0;
  let valuedRedemptions = 0;
  let firstActivityAt = null;

  for (const txn of txns) {
    const at = new Date(txn.createdAt);
    if (!firstActivityAt || at < firstActivityAt) firstActivityAt = at;

    const dayKey = `${at.getUTCFullYear()}-${at.getUTCMonth()}-${at.getUTCDate()}`;

    if (txn.type === "earn") {
      const userId = txn.userId.toString();
      const key = accountKeyByUserId.get(userId) || userId;
      const row = earnsByAccount.get(key) || { count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += txn.billAmount || 0;
      earnsByAccount.set(key, row);

      const days = activityDaysByAccount.get(key) || new Set();
      days.add(dayKey);
      activityDaysByAccount.set(key, days);

      revenueTracked += txn.billAmount || 0;
      if (!since || at >= since) revenueSince += txn.billAmount || 0;
    }

    if (txn.type === "redeem") {
      const userId = txn.userId && txn.userId.toString();
      if (userId) {
        const key = accountKeyByUserId.get(userId) || userId;
        const days = activityDaysByAccount.get(key) || new Set();
        days.add(dayKey);
        activityDaysByAccount.set(key, days);
      }
      redemptionCount += 1;
      // Null means "not recorded" (a points-only reward, or a row predating
      // the field), never "free" — so it is skipped, and the caller reports
      // coverage instead of quietly under-reporting.
      if (typeof txn.rewardValueNpr === "number") {
        rewardValueRedeemed += txn.rewardValueNpr;
        valuedRedemptions += 1;
      }
    }
  }

  return {
    earnsByAccount,
    activityDaysByAccount,
    revenueTracked,
    revenueSince,
    redemptionCount,
    rewardValueRedeemed,
    valuedRedemptions,
    firstActivityAt
  };
};

// A customer is someone who has actually transacted — a membership with at
// least one earn. /explore provisions a membership the moment somebody opens
// an outlet's page, so counting every membership would let browsers who never
// bought anything drag retention toward zero.
//
// A repeat customer is one who has shown activity on two or more distinct
// calendar days, where activity is any transaction — an earn or a redeem.
// This is what "comes back" means: a regular who earned once, then returned
// a week later to redeem, has visited twice and earned that label, even
// though only the first visit produced an earn. Two transactions in one
// afternoon do NOT count as repeat — they are the same visit.
//
// repeatRevenue counts ALL of a repeat customer's revenue, first visit
// included — the claim being made is "this share of your revenue comes from
// people who come back", and their first visit is part of that relationship.
// Customers with a redeem-only presence are not counted as customers and
// contribute no revenue (there is none to contribute), but they do push
// their earn-only account into repeat territory once a second day appears.
const summarizeEarns = (earnsByAccount, activityDaysByAccount) => {
  let customers = 0;
  let repeatCustomers = 0;
  let repeatRevenue = 0;

  for (const [key, row] of earnsByAccount.entries()) {
    if (row.count < 1) continue;
    customers += 1;
    const days = activityDaysByAccount.get(key) || new Set();
    if (days.size >= 2) {
      repeatCustomers += 1;
      repeatRevenue += row.revenue;
    }
  }

  return { customers, repeatCustomers, repeatRevenue };
};

// Derived live from figures already computed — no stored state, no write
// hooks, no achievement dates. Interleaved so a new outlet sees a reachable
// next step rather than five locked count thresholds in a row.
//
// "First campaign run" reads Campaign, not Broadcast: a campaign changes what
// a bill is worth, which is what this page is about. A broadcast is a message.
const buildMilestones = ({ customers, redemptionCount, campaignCount, retentionPercent, revenueTracked }) => [
  { key: "customers_10", label: "10 customers", sublabel: "joined", achieved: customers >= 10 },
  { key: "first_redemption", label: "First reward", sublabel: "redeemed", achieved: redemptionCount >= 1 },
  { key: "customers_50", label: "50 customers", sublabel: "joined", achieved: customers >= 50 },
  { key: "first_campaign", label: "First campaign", sublabel: "run", achieved: campaignCount >= 1 },
  { key: "customers_100", label: "100 customers", sublabel: "joined", achieved: customers >= 100 },
  { key: "retention_50", label: "50% retention", sublabel: "rate achieved", achieved: (retentionPercent ?? 0) >= 50 },
  { key: "customers_500", label: "500 customers", sublabel: "joined", achieved: customers >= 500 },
  { key: "revenue_100k", label: "Rs 1 lakh", sublabel: "revenue tracked", achieved: revenueTracked >= 100000 },
  { key: "customers_1000", label: "1,000 customers", sublabel: "joined", achieved: customers >= 1000 },
  { key: "revenue_500k", label: "Rs 5 lakh", sublabel: "revenue tracked", achieved: revenueTracked >= 500000 }
];

// Shared by the outlet and company views: both derive the same ratios off
// whatever facts they were handed, so the two pages can never disagree about
// what "retention" means.
const presentImpact = ({ facts, campaignCount }) => {
  const { customers, repeatCustomers, repeatRevenue } = summarizeEarns(facts.earnsByAccount, facts.activityDaysByAccount);

  // Null, not zero: an outlet with no customers has no retention rate, and
  // rendering 0% would read as a failure rather than an absence.
  const retentionPercent = customers > 0 ? Math.round((repeatCustomers / customers) * 100) : null;
  const repeatRevenuePercent = facts.revenueTracked > 0
    ? Math.round((repeatRevenue / facts.revenueTracked) * 100)
    : null;
  const avgSpendPerRepeatCustomer = repeatCustomers > 0
    ? round2(repeatRevenue / repeatCustomers)
    : null;

  return {
    customers,
    repeatCustomers,
    retentionPercent,
    revenueTracked: round2(facts.revenueTracked),
    repeatRevenue: round2(repeatRevenue),
    repeatRevenuePercent,
    avgSpendPerRepeatCustomer,
    redemptionCount: facts.redemptionCount,
    rewardValueRedeemed: round2(facts.rewardValueRedeemed),
    // The UI says "based on 34 of 51 redemptions" rather than under-reporting
    // silently. Rows predating rewardValueNpr, and every points-only reward,
    // land in `total` but not `valued`.
    rewardValueCoverage: {
      valued: facts.valuedRedemptions,
      total: facts.redemptionCount
    },
    firstActivityAt: facts.firstActivityAt ? facts.firstActivityAt.toISOString() : null,
    milestones: buildMilestones({
      customers,
      redemptionCount: facts.redemptionCount,
      campaignCount,
      retentionPercent,
      revenueTracked: facts.revenueTracked
    })
  };
};

const getOutletImpact = async (organizationId) => {
  const [facts, campaignCount] = await Promise.all([
    collectOutletFacts(organizationId),
    Campaign.countDocuments({ organizationId })
  ]);
  return presentImpact({ facts, campaignCount });
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

// Does the subscription pay for itself?
//
// NOT all-time revenue over a monthly price — that compares a cumulative
// flow to one month of cost and is not a ratio at all. Both sides span the
// same window: revenue earned on or after the subscription started, over the
// cost incurred since the subscription started.
//
// subscription.createdAt is the right start. subscriptionService keeps ONE
// Subscription document per company and updates it in place on renewal, so
// createdAt is when they began paying, not when they last renewed.
//
// Returns null when there is no subscription or no plan attached — a
// platform-onboarded company has nothing to compare against, and the block
// is hidden rather than shown empty.
const buildRoi = async (companyId, revenueSinceSubscription) => {
  const subscription = await Subscription.findOne({ companyId });
  if (!subscription || !subscription.planId) return null;

  const plan = await SubscriptionPlan.findOne({ _id: subscription.planId });
  if (!plan) return null;

  const intervalDays = plan.billingIntervalDays || 365;
  // Whole rupees: NPR prices are whole numbers everywhere else in the app
  // (SubscriptionPlan.priceNpr, formatNpr), and "Rs 205.4/month" next to
  // "Rs 7,450" reads as a defect rather than as precision.
  const monthlyCost = Math.round(plan.priceNpr / (intervalDays / 30));

  // Floored at 1: a company three days into its first month would otherwise
  // divide by ~0.1 and read as 30X.
  const elapsedMs = Date.now() - new Date(subscription.createdAt).getTime();
  const monthsElapsed = Math.max(1, round2(elapsedMs / MONTH_MS));
  // The exact figure drives the ratio; only the displayed total is rounded,
  // so the multiple never inherits a rounding error.
  const costToDateExact = monthlyCost * monthsElapsed;
  const costToDate = Math.round(costToDateExact);

  return {
    planName: plan.name,
    subscriptionStartedAt: new Date(subscription.createdAt).toISOString(),
    monthlyCost,
    monthsElapsed,
    costToDate,
    revenueSinceSubscription: round2(revenueSinceSubscription),
    // Reported as-is, including below 1. An owner who catches one inflated
    // number stops trusting the whole page.
    roiMultiple: costToDateExact > 0 ? round2(revenueSinceSubscription / costToDateExact) : null
  };
};

// The company owner's cross-outlet value view.
//
// Deliberately company-private: reachable only through /api/company
// (verifyCompanySession), never through /api/admin — an outlet's console must
// never see its siblings' numbers. Same boundary companyReportService holds.
//
// Retention at company level merges each person's earns across the company's
// outlets before counting, because collectOutletFacts keys them by
// CustomerAccount. That is deliberate and it is stricter than summing: one
// earn at each of two outlets is NOT a repeat customer — they have not come
// back anywhere. Each outlet still reads them as single-visit in perOutlet.
const getCompanyImpact = async (companyId) => {
  const outlets = await Organization.find({ companyId });

  // Fetched first: the ROI window has to be known before the ledger pass, so
  // each outlet can accumulate revenue-since alongside revenue-all-time.
  const subscription = await Subscription.findOne({ companyId });
  const since = subscription ? new Date(subscription.createdAt) : null;

  const parts = await Promise.all(
    outlets.map(async (outlet) => {
      const [facts, campaignCount] = await Promise.all([
        collectOutletFacts(outlet._id, { since }),
        Campaign.countDocuments({ organizationId: outlet._id })
      ]);
      return { outlet, facts, campaignCount };
    })
  );

  const merged = {
    earnsByAccount: new Map(),
    activityDaysByAccount: new Map(),
    revenueTracked: 0,
    revenueSince: 0,
    redemptionCount: 0,
    rewardValueRedeemed: 0,
    valuedRedemptions: 0,
    firstActivityAt: null
  };
  let campaignCount = 0;

  for (const { facts, campaignCount: outletCampaigns } of parts) {
    for (const [key, row] of facts.earnsByAccount) {
      const existing = merged.earnsByAccount.get(key) || { count: 0, revenue: 0 };
      existing.count += row.count;
      existing.revenue += row.revenue;
      merged.earnsByAccount.set(key, existing);
    }
    for (const [key, days] of facts.activityDaysByAccount) {
      const existing = merged.activityDaysByAccount.get(key) || new Set();
      for (const day of days) existing.add(day);
      merged.activityDaysByAccount.set(key, existing);
    }
    merged.revenueTracked += facts.revenueTracked;
    merged.revenueSince += facts.revenueSince;
    merged.redemptionCount += facts.redemptionCount;
    merged.rewardValueRedeemed += facts.rewardValueRedeemed;
    merged.valuedRedemptions += facts.valuedRedemptions;
    if (facts.firstActivityAt && (!merged.firstActivityAt || facts.firstActivityAt < merged.firstActivityAt)) {
      merged.firstActivityAt = facts.firstActivityAt;
    }
    campaignCount += outletCampaigns;
  }

  const perOutlet = parts
    .map(({ outlet, facts, campaignCount: outletCampaigns }) => ({
      outletId: outlet._id.toString(),
      slug: outlet.slug,
      name: outlet.name,
      status: outlet.status,
      ...presentImpact({ facts, campaignCount: outletCampaigns })
    }))
    .sort((a, b) => b.revenueTracked - a.revenueTracked);

  return {
    ...presentImpact({ facts: merged, campaignCount }),
    outletCount: outlets.filter((o) => o.status !== "archived").length,
    roi: await buildRoi(companyId, merged.revenueSince),
    perOutlet
  };
};

module.exports = {
  collectOutletFacts,
  summarizeEarns,
  buildMilestones,
  presentImpact,
  getOutletImpact,
  buildRoi,
  getCompanyImpact
};
