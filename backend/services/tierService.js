const Organization = require("../models/Organization");
const PointsTransaction = require("../models/PointsTransaction");
const { TIER_LABELS } = require("../config/platform");

const TRAILING_WINDOW_DAYS = 365;

// Highest-to-lowest, so a customer meeting Platinum's bar returns Platinum,
// not the first (lowest) label that also happens to match.
const LABELS_HIGH_TO_LOW = [...TIER_LABELS].reverse();

// A tier is always derived from the ledger, never stored — same reasoning
// as PointsBalance: a stored value could drift from the transactions behind
// it. Computed fresh on every call.
const resolveTier = async (organizationId, customerId) => {
  const org = await Organization.findOne({ _id: organizationId });
  if (!org || !org.tierThresholds) {
    return null;
  }

  const since = new Date(Date.now() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const earns = await PointsTransaction.find({
    organizationId,
    userId: customerId,
    type: "earn",
    createdAt: { $gte: since }
  });

  const visits = earns.length;
  const spend = earns.reduce((sum, t) => sum + (t.billAmount || 0), 0);

  for (const label of LABELS_HIGH_TO_LOW) {
    const threshold = org.tierThresholds[label];
    if (!threshold) continue;
    const { minVisits, minSpend } = threshold;
    if (minVisits === null || minVisits === undefined) continue;
    if (minSpend === null || minSpend === undefined) continue;
    if (visits >= minVisits && spend >= minSpend) {
      return label;
    }
  }

  return null;
};

module.exports = { resolveTier, TRAILING_WINDOW_DAYS };
