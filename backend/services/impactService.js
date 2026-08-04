const User = require("../models/User");
const Campaign = require("../models/Campaign");
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
  let revenueTracked = 0;
  let revenueSince = 0;
  let redemptionCount = 0;
  let rewardValueRedeemed = 0;
  let valuedRedemptions = 0;
  let firstActivityAt = null;

  for (const txn of txns) {
    const at = new Date(txn.createdAt);
    if (!firstActivityAt || at < firstActivityAt) firstActivityAt = at;

    if (txn.type === "earn") {
      const userId = txn.userId.toString();
      const key = accountKeyByUserId.get(userId) || userId;
      const row = earnsByAccount.get(key) || { count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += txn.billAmount || 0;
      earnsByAccount.set(key, row);

      revenueTracked += txn.billAmount || 0;
      if (!since || at >= since) revenueSince += txn.billAmount || 0;
    }

    if (txn.type === "redeem") {
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
// A repeat customer has two or more earns. Two bills in one afternoon count
// as two: each is a separate purchase the customer chose to make, and
// de-duplicating by day would understate outlets whose regulars buy twice a
// day.
//
// repeatRevenue counts ALL of a repeat customer's revenue, first visit
// included — the claim being made is "this share of your revenue comes from
// people who come back", and their first visit is part of that relationship.
const summarizeEarns = (earnsByAccount) => {
  let customers = 0;
  let repeatCustomers = 0;
  let repeatRevenue = 0;

  for (const row of earnsByAccount.values()) {
    if (row.count < 1) continue;
    customers += 1;
    if (row.count >= 2) {
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
  const { customers, repeatCustomers, repeatRevenue } = summarizeEarns(facts.earnsByAccount);

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

module.exports = {
  collectOutletFacts,
  summarizeEarns,
  buildMilestones,
  presentImpact,
  getOutletImpact
};
