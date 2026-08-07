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
const resolveTier = async (organizationId, customerId, { org, earns } = {}) => {
  const resolvedOrg = org || (await Organization.findOne({ _id: organizationId }));
  if (!resolvedOrg || !resolvedOrg.tierThresholds) {
    return null;
  }

  const since = new Date(Date.now() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const resolvedEarns = earns
    ? earns.filter((t) => new Date(t.createdAt) >= since)
    : await PointsTransaction.find({
        organizationId,
        userId: customerId,
        type: "earn",
        createdAt: { $gte: since }
      });

  const visits = resolvedEarns.length;
  const spend = resolvedEarns.reduce((sum, t) => sum + (t.billAmount || 0), 0);

  for (const label of LABELS_HIGH_TO_LOW) {
    const threshold = resolvedOrg.tierThresholds[label];
    if (!threshold) continue;
    const { minVisits, minSpend } = threshold;
    const hasVisits = minVisits !== null && minVisits !== undefined;
    const hasSpend = minSpend !== null && minSpend !== undefined;
    if (!hasVisits && !hasSpend) continue;
    // Either criterion qualifies, not both — a customer who visits often but
    // spends modestly (or vice versa) still earns tier credit for the one
    // habit they actually have. A threshold with only one side configured
    // (the other left null) is judged solely on the side that's set.
    const meetsVisits = hasVisits && visits >= minVisits;
    const meetsSpend = hasSpend && spend >= minSpend;
    if (meetsVisits || meetsSpend) {
      return label;
    }
  }

  return null;
};

module.exports = { resolveTier, TRAILING_WINDOW_DAYS };
