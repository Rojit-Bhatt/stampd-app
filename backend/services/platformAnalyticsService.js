const ExcelJS = require("exceljs");
const Company = require("../models/Company");
const Organization = require("../models/Organization");
const User = require("../models/User");
const CustomerAccount = require("../models/CustomerAccount");
const PointsTransaction = require("../models/PointsTransaction");
const { toPoints } = require("../utils/pointsMath");
const { resolveDateRange } = require("./reportService");
const { TIER_LABELS } = require("../config/platform");
const { resolveTier } = require("./tierService");

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
// Only scans outlets that have at least one tier label actually configured
// — most outlets won't, and skipping them avoids a ledger query per
// customer at outlets with nothing to compute. Reuses each qualifying
// outlet's already-fetched org/earns across all its customers (same
// {org, earns} reuse tierService.resolveTier already supports), never a
// fresh query per customer.
const getPlatformTierDistribution = async () => {
  const orgs = await Organization.find({});
  const counts = { untiered: 0 };
  for (const label of TIER_LABELS) counts[label] = 0;

  for (const org of orgs) {
    const configured = TIER_LABELS.some((label) => {
      const t = org.tierThresholds && org.tierThresholds[label];
      return t && t.minVisits !== null && t.minVisits !== undefined && t.minSpend !== null && t.minSpend !== undefined;
    });
    if (!configured) continue;

    const customers = await User.find({ role: "customer", organizationId: org._id });
    const earns = await PointsTransaction.find({ organizationId: org._id, type: "earn" });
    const earnsByCustomer = new Map();
    for (const t of earns) {
      const key = t.userId.toString();
      if (!earnsByCustomer.has(key)) earnsByCustomer.set(key, []);
      earnsByCustomer.get(key).push(t);
    }

    for (const customer of customers) {
      const customerEarns = earnsByCustomer.get(customer._id.toString()) || [];
      const tier = await resolveTier(org._id, customer._id, { org, earns: customerEarns });
      if (tier && Object.prototype.hasOwnProperty.call(counts, tier)) {
        counts[tier] += 1;
      } else {
        counts.untiered += 1;
      }
    }
  }

  return counts;
};

const getPlatformAnalytics = async () => {
  const now = new Date();
  const currentStart = new Date(now.getTime() - WEEK_MS);
  const previousStart = new Date(now.getTime() - 2 * WEEK_MS);
  const currentRange = { $gte: currentStart, $lte: now };
  const previousRange = { $gte: previousStart, $lte: currentStart };

  const [
    companiesTotal,
    outletsTotal,
    outletsActiveOrgs,
    customersTotal,
    newCustomersCurrent,
    newCustomersPrevious,
    txnsCurrent,
    txnsPrevious
  ] = await Promise.all([
    Company.countDocuments({}),
    Organization.countDocuments({}),
    Organization.find({ status: "active" }),
    // The global identity count — distinct people, not per-outlet
    // memberships, which would double-count anyone who belongs to more
    // than one outlet (exactly what the isolation-test customer "bikash"
    // is seeded to exercise).
    CustomerAccount.countDocuments({}),
    User.countDocuments({ role: "customer", createdAt: currentRange }),
    User.countDocuments({ role: "customer", createdAt: previousRange }),
    PointsTransaction.find({ createdAt: currentRange }),
    PointsTransaction.find({ createdAt: previousRange })
  ]);

  const earnsCurrent = txnsCurrent.filter((t) => t.type === "earn");
  const earnsPrevious = txnsPrevious.filter((t) => t.type === "earn");
  const redeemsCurrent = txnsCurrent.filter((t) => t.type === "redeem");
  const redeemsPrevious = txnsPrevious.filter((t) => t.type === "redeem");

  const pointsCurrent = earnsCurrent.reduce((sum, t) => sum + t.pointsCenti, 0);
  const pointsPrevious = earnsPrevious.reduce((sum, t) => sum + t.pointsCenti, 0);
  const revenueCurrent = earnsCurrent.reduce((sum, t) => sum + (t.billAmount || 0), 0);
  const revenuePrevious = earnsPrevious.reduce((sum, t) => sum + (t.billAmount || 0), 0);

  const velocityStart = new Date(now.getTime() - 14 * DAY_MS);
  const velocityTxns = await PointsTransaction.find({ createdAt: { $gte: velocityStart, $lte: now } });
  const velocityByDay = new Map();
  for (let i = 13; i >= 0; i -= 1) {
    velocityByDay.set(dayKey(new Date(now.getTime() - i * DAY_MS)), 0);
  }
  for (const txn of velocityTxns) {
    if (txn.type !== "earn") continue;
    const key = dayKey(txn.createdAt);
    if (velocityByDay.has(key)) velocityByDay.set(key, velocityByDay.get(key) + txn.pointsCenti);
  }
  const pointsVelocity = Array.from(velocityByDay.entries()).map(([date, centi]) => ({
    date,
    points: toPoints(centi)
  }));

  const tierDistribution = await getPlatformTierDistribution();

  return {
    // Point-in-time totals, not flows — deliberately no trend badge, same
    // reasoning as pointsOutstanding on the outlet-level dashboard.
    companiesTotal,
    outletsTotal,
    outletsActive: outletsActiveOrgs.length,
    customersTotal,
    newCustomers: { value: newCustomersCurrent, trend: weekOverWeekTrend(newCustomersCurrent, newCustomersPrevious) },
    pointsIssued: { value: toPoints(pointsCurrent), trend: weekOverWeekTrend(pointsCurrent, pointsPrevious) },
    revenue: { value: Math.round(revenueCurrent * 100) / 100, trend: weekOverWeekTrend(revenueCurrent, revenuePrevious) },
    redemptions: { value: redeemsCurrent.length, trend: weekOverWeekTrend(redeemsCurrent.length, redeemsPrevious.length) },
    pointsVelocity,
    tierDistribution
  };
};

// A date-ranged, per-company breakdown across the WHOLE platform — the
// cross-company counterpart to companyReportService.getCompanyRollup, which
// is deliberately scoped to one company at a time (company-private, never
// reachable outside /api/company). Same per-outlet-then-sum-in-JS approach,
// since the mock DB has no aggregation pipeline.
//
// Deliberately flows only (new customers, points issued/redeemed, revenue,
// redemptions) — no points-outstanding/expired column. Those are balance
// concepts, and points never pool even within one company's own outlets
// (see getCompanyRollup's header comment), so summing a "balance" across
// companies would be adding up numbers that were never poolable to begin
// with — same reasoning, one level up.
const getPlatformCompanyReportRows = async ({ startDate, endDate } = {}) => {
  const { start, end } = resolveDateRange(startDate, endDate);
  const range = { $gte: start, $lte: end };

  const companies = await Company.find({});

  const rows = await Promise.all(
    companies.map(async (company) => {
      const outlets = await Organization.find({ companyId: company._id });

      const perOutlet = await Promise.all(
        outlets.map(async (outlet) => {
          const newCustomers = await User.countDocuments({
            role: "customer",
            organizationId: outlet._id,
            createdAt: range
          });
          const txns = await PointsTransaction.find({ organizationId: outlet._id, createdAt: range });
          const earns = txns.filter((t) => t.type === "earn");
          const redeems = txns.filter((t) => t.type === "redeem");

          return {
            archived: outlet.status === "archived",
            newCustomers,
            pointsIssuedCenti: earns.reduce((sum, t) => sum + t.pointsCenti, 0),
            pointsRedeemedCenti: redeems.reduce((sum, t) => sum - t.pointsCenti, 0),
            revenue: earns.reduce((sum, t) => sum + (t.billAmount || 0), 0),
            redemptionCount: redeems.length
          };
        })
      );

      const totals = perOutlet.reduce(
        (acc, o) => ({
          newCustomers: acc.newCustomers + o.newCustomers,
          pointsIssuedCenti: acc.pointsIssuedCenti + o.pointsIssuedCenti,
          pointsRedeemedCenti: acc.pointsRedeemedCenti + o.pointsRedeemedCenti,
          revenue: acc.revenue + o.revenue,
          redemptionCount: acc.redemptionCount + o.redemptionCount
        }),
        { newCustomers: 0, pointsIssuedCenti: 0, pointsRedeemedCenti: 0, revenue: 0, redemptionCount: 0 }
      );

      return {
        company: company.name,
        status: company.status,
        outlets: perOutlet.filter((o) => !o.archived).length,
        newCustomers: totals.newCustomers,
        // Centipoints never leave the backend — convert once, here.
        pointsIssued: toPoints(totals.pointsIssuedCenti),
        pointsRedeemed: toPoints(totals.pointsRedeemedCenti),
        revenue: Math.round(totals.revenue * 100) / 100,
        redemptions: totals.redemptionCount
      };
    })
  );

  return { rows: rows.sort((a, b) => b.revenue - a.revenue), start, end };
};

const buildPlatformCompanyReportWorkbook = async ({ rows, start, end }) => {
  const workbook = new ExcelJS.Workbook();
  // The date range lives in the sheet name (Excel truncates ~31 chars) so
  // it's visible without adding a preamble row that would push the real
  // header off row 1 — row 1 = header is what lets a plain admin sort/
  // filter this in Excel, and is the convention the test helpers assume.
  const sheet = workbook.addWorksheet(
    `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`.slice(0, 31)
  );
  sheet.addRow([
    "Company", "Status", "Outlets", "New Customers",
    "Points Issued", "Points Redeemed", "Revenue", "Redemptions"
  ]);
  for (const r of rows) {
    sheet.addRow([
      r.company, r.status, r.outlets, r.newCustomers,
      r.pointsIssued, r.pointsRedeemed, r.revenue, r.redemptions
    ]);
  }
  return workbook.xlsx.writeBuffer();
};

module.exports = { getPlatformAnalytics, getPlatformTierDistribution, getPlatformCompanyReportRows, buildPlatformCompanyReportWorkbook };
