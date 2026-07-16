const Organization = require("../models/Organization");
const User = require("../models/User");
const Voucher = require("../models/Voucher");
const StampClaimEvent = require("../models/StampClaimEvent");

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

const weekOverWeekTrend = (current, previous) => {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? null : 0;
};

// Platform-wide rollup: every query here is deliberately missing an
// organizationId filter — this is the one surface where cross-tenant
// aggregation is the point (a platform admin overseeing the whole SaaS),
// not a leak. It never exposes which specific tenant a customer belongs
// to, only aggregate counts/sums, so it doesn't violate the per-tenant
// isolation invariant that governs every other report in this codebase.
const getPlatformAnalytics = async () => {
  const now = new Date();
  const currentStart = new Date(now.getTime() - WEEK_MS);
  const previousStart = new Date(now.getTime() - 2 * WEEK_MS);
  const currentRange = { $gte: currentStart, $lte: now };
  const previousRange = { $gte: previousStart, $lte: currentStart };

  const [
    businessesTotal,
    businessesActiveOrgs,
    newCustomersCurrent,
    newCustomersPrevious,
    stampsCurrent,
    stampsPrevious,
    vouchersRedeemedCurrent,
    vouchersRedeemedPrevious,
    eventsCurrent,
    eventsPrevious,
  ] = await Promise.all([
    Organization.countDocuments({}),
    Organization.find({ status: "active" }),
    User.countDocuments({ role: "customer", createdAt: currentRange }),
    User.countDocuments({ role: "customer", createdAt: previousRange }),
    StampClaimEvent.countDocuments({ createdAt: currentRange }),
    StampClaimEvent.countDocuments({ createdAt: previousRange }),
    Voucher.countDocuments({ isValid: false, redeemedAt: currentRange }),
    Voucher.countDocuments({ isValid: false, redeemedAt: previousRange }),
    StampClaimEvent.find({ createdAt: currentRange }),
    StampClaimEvent.find({ createdAt: previousRange }),
  ]);

  const revenueCurrent = eventsCurrent.reduce((sum, e) => sum + (e.billAmount || 0), 0);
  const revenuePrevious = eventsPrevious.reduce((sum, e) => sum + (e.billAmount || 0), 0);

  const velocityStart = new Date(now.getTime() - 14 * DAY_MS);
  const velocityEvents = await StampClaimEvent.find({ createdAt: { $gte: velocityStart, $lte: now } });
  const velocityByDay = new Map();
  for (let i = 13; i >= 0; i -= 1) {
    velocityByDay.set(dayKey(new Date(now.getTime() - i * DAY_MS)), 0);
  }
  for (const event of velocityEvents) {
    const key = dayKey(event.createdAt);
    if (velocityByDay.has(key)) velocityByDay.set(key, velocityByDay.get(key) + 1);
  }
  const stampVelocity = Array.from(velocityByDay.entries()).map(([date, count]) => ({ date, count }));

  return {
    businessesTotal,
    businessesActive: businessesActiveOrgs.length,
    newCustomers: { value: newCustomersCurrent, trend: weekOverWeekTrend(newCustomersCurrent, newCustomersPrevious) },
    stampsIssued: { value: stampsCurrent, trend: weekOverWeekTrend(stampsCurrent, stampsPrevious) },
    revenue: { value: revenueCurrent, trend: weekOverWeekTrend(revenueCurrent, revenuePrevious) },
    vouchersRedeemed: { value: vouchersRedeemedCurrent, trend: weekOverWeekTrend(vouchersRedeemedCurrent, vouchersRedeemedPrevious) },
    stampVelocity,
  };
};

module.exports = { getPlatformAnalytics };
