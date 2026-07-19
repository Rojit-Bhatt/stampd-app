const ExcelJS = require("exceljs");
const User = require("../models/User");
const PointsBalance = require("../models/PointsBalance");
const PointsTransaction = require("../models/PointsTransaction");
const {
  getCustomerDetailRows,
  getOutletTransactions,
  effectiveBalanceCenti,
  isExpiredNow
} = require("./pointsService");
const { toPoints } = require("../utils/pointsMath");
const { resolveDateRange } = require("../utils/dateRange");

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const sumCenti = (txns) => txns.reduce((sum, t) => sum + t.pointsCenti, 0);
const sumRevenue = (txns) => txns.reduce((sum, t) => sum + (t.billAmount || 0), 0);
const round2 = (n) => Math.round(n * 100) / 100;

// Points currently sitting in customers' balances at this outlet — a
// liability snapshot, not a flow. Applies the same lazy expiry a customer
// would see on their own dashboard, so a balance that has aged out is never
// counted as outstanding just because nobody has touched the row since.
const getPointsOutstandingCenti = async (organizationId) => {
  const now = new Date();
  const balances = await PointsBalance.find({ organizationId });
  return balances.reduce((sum, b) => sum + effectiveBalanceCenti(b, now), 0);
};

// Points that have expired within [start, end] — INCLUDING ones that have
// aged out but not yet been materialized onto a ledger row.
//
// Counting only materialized `expire` rows is what broke reconciliation:
// `pointsOutstanding` already excludes an aged-out balance (it's derived),
// but `pointsExpired` wouldn't mention it until the customer happened to
// come back — so issued − redeemed − expired ≠ outstanding, and the gap grew
// with every churned customer, who by definition never comes back.
//
// No double-count: settleExpiryInTransaction dates its ledger row at the
// balance's `expiresAt` (the real moment of death) and clears the deadline,
// so a given expiry lands in exactly one period whether it's been written
// down yet or not.
const getPointsExpiredCenti = async (organizationId, start, end) => {
  const now = new Date();

  const materialized = await PointsTransaction.find({
    organizationId,
    createdAt: { $gte: start, $lte: end }
  });
  const materializedCenti = materialized
    .filter((t) => t.type === "expire")
    .reduce((sum, t) => sum - t.pointsCenti, 0);

  const balances = await PointsBalance.find({ organizationId });
  const pendingCenti = balances.reduce((sum, b) => {
    if (!isExpiredNow(b, now)) return sum;
    const diedAt = new Date(b.expiresAt).getTime();
    if (diedAt < start.getTime() || diedAt > end.getTime()) return sum;
    return sum + b.balanceCenti;
  }, 0);

  return materializedCenti + pendingCenti;
};

const getSummaryStats = async (organizationId, { startDate, endDate } = {}) => {
  const { start, end } = resolveDateRange(startDate, endDate);
  const range = { $gte: start, $lte: end };

  const newCustomers = await User.countDocuments({
    role: "customer",
    organizationId,
    createdAt: range
  });

  const txns = await PointsTransaction.find({ organizationId, createdAt: range });
  const earns = txns.filter((t) => t.type === "earn");
  const redeems = txns.filter((t) => t.type === "redeem");

  return {
    newCustomers,
    transactions: earns.length + redeems.length,
    pointsIssued: toPoints(sumCenti(earns)),
    // Stored signed (negative); reported as a positive magnitude, since
    // "points redeemed: -400" reads as a bug to everyone but the ledger.
    pointsRedeemed: toPoints(-sumCenti(redeems)),
    pointsExpired: toPoints(await getPointsExpiredCenti(organizationId, start, end)),
    pointsOutstanding: toPoints(await getPointsOutstandingCenti(organizationId)),
    totalRevenue: round2(sumRevenue(earns)),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
};

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

// Week-over-week % change. Only meaningful for flow metrics (counted within
// a window) — undefined (null) when the prior window was zero and the
// current one isn't, since a percentage off zero is not a real number.
const weekOverWeekTrend = (current, previous) => {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? null : 0;
};

// Backs the Admin Dashboard's 4 KPI tiles + 2 charts. Every number here is
// real — no fabricated trend/activity data. The mock DB has no aggregation
// pipeline, so day/week bucketing is plain find() + JS loops.
const getDashboardStats = async (organizationId) => {
  const now = new Date();
  const currentStart = new Date(now.getTime() - WEEK_MS);
  const previousStart = new Date(now.getTime() - 2 * WEEK_MS);
  const currentRange = { $gte: currentStart, $lte: now };
  const previousRange = { $gte: previousStart, $lte: currentStart };

  const [
    newCustomersCurrent,
    newCustomersPrevious,
    txnsCurrent,
    txnsPrevious,
    outstandingCenti
  ] = await Promise.all([
    User.countDocuments({ role: "customer", organizationId, createdAt: currentRange }),
    User.countDocuments({ role: "customer", organizationId, createdAt: previousRange }),
    PointsTransaction.find({ organizationId, createdAt: currentRange }),
    PointsTransaction.find({ organizationId, createdAt: previousRange }),
    getPointsOutstandingCenti(organizationId)
  ]);

  const earnsCurrent = txnsCurrent.filter((t) => t.type === "earn");
  const earnsPrevious = txnsPrevious.filter((t) => t.type === "earn");

  const pointsCurrent = sumCenti(earnsCurrent);
  const pointsPrevious = sumCenti(earnsPrevious);
  const revenueCurrent = sumRevenue(earnsCurrent);
  const revenuePrevious = sumRevenue(earnsPrevious);

  // Points velocity: points issued per day, last 14 days.
  const velocityStart = new Date(now.getTime() - 14 * DAY_MS);
  const velocityTxns = await PointsTransaction.find({
    organizationId,
    createdAt: { $gte: velocityStart, $lte: now }
  });
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

  // Points activity: issued vs redeemed per week, last 8 weeks.
  const activityStart = new Date(now.getTime() - 8 * WEEK_MS);
  const activityTxns = await PointsTransaction.find({
    organizationId,
    createdAt: { $gte: activityStart, $lte: now }
  });
  const weekBuckets = [];
  for (let i = 7; i >= 0; i -= 1) {
    weekBuckets.push({
      weekStart: new Date(now.getTime() - (i + 1) * WEEK_MS),
      weekEnd: new Date(now.getTime() - i * WEEK_MS),
      earnedCenti: 0,
      redeemedCenti: 0
    });
  }
  for (const txn of activityTxns) {
    const at = new Date(txn.createdAt).getTime();
    for (const bucket of weekBuckets) {
      if (at < bucket.weekStart.getTime() || at >= bucket.weekEnd.getTime()) continue;
      if (txn.type === "earn") bucket.earnedCenti += txn.pointsCenti;
      if (txn.type === "redeem") bucket.redeemedCenti -= txn.pointsCenti;
    }
  }
  const pointsActivity = weekBuckets.map((b) => ({
    weekStart: b.weekStart.toISOString().slice(0, 10),
    earned: toPoints(b.earnedCenti),
    redeemed: toPoints(b.redeemedCenti)
  }));

  return {
    newCustomers: { value: newCustomersCurrent, trend: weekOverWeekTrend(newCustomersCurrent, newCustomersPrevious) },
    pointsIssued: { value: toPoints(pointsCurrent), trend: weekOverWeekTrend(pointsCurrent, pointsPrevious) },
    revenue: { value: round2(revenueCurrent), trend: weekOverWeekTrend(revenueCurrent, revenuePrevious) },
    // A snapshot, not a flow — deliberately no trend badge. Week-over-week on
    // a running balance would compare two unrelated instants.
    pointsOutstanding: { value: toPoints(outstandingCenti), trend: null },
    pointsVelocity,
    pointsActivity
  };
};

const buildSummaryWorkbook = async (stats) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Summary");
  sheet.addRow(["Metric", "Value"]);
  sheet.addRow(["Date range", `${stats.startDate} to ${stats.endDate}`]);
  sheet.addRow(["New customers", stats.newCustomers]);
  sheet.addRow(["Transactions", stats.transactions]);
  sheet.addRow(["Points issued", stats.pointsIssued]);
  sheet.addRow(["Points redeemed", stats.pointsRedeemed]);
  sheet.addRow(["Points expired", stats.pointsExpired]);
  sheet.addRow(["Points outstanding", stats.pointsOutstanding]);
  sheet.addRow(["Total revenue", stats.totalRevenue]);
  return workbook.xlsx.writeBuffer();
};

const buildCustomersWorkbook = async (organizationId) => {
  const rows = await getCustomerDetailRows(organizationId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customers");
  sheet.addRow([
    "Name", "Email", "Phone", "Address", "Customer #",
    "Points Balance", "Lifetime Points", "Redemptions", "Total Spent", "Last Activity"
  ]);
  for (const r of rows) {
    sheet.addRow([
      r.name,
      r.email,
      r.phone,
      r.address,
      r.customerNo,
      r.pointsBalance,
      r.lifetimePoints,
      r.redemptionCount,
      r.totalSpent,
      r.lastActivityAt ? new Date(r.lastActivityAt).toISOString().slice(0, 10) : ""
    ]);
  }
  return workbook.xlsx.writeBuffer();
};

// The full outlet ledger as a spreadsheet — the export counterpart of the
// admin transaction history page. Takes the same optional date range as the
// page itself, so filtering to "Today" then exporting downloads today's
// rows, not the whole ledger.
const buildTransactionsWorkbook = async (organizationId, { startDate, endDate } = {}) => {
  const { data: rows } = await getOutletTransactions(organizationId, { limit: 5000, startDate, endDate });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");
  sheet.addRow(["When", "Customer", "Type", "Points", "Balance After", "Bill Amount", "Reward"]);
  for (const r of rows) {
    sheet.addRow([
      new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " "),
      r.customerName,
      r.type,
      r.points,
      r.balanceAfter,
      r.billAmount ?? "",
      r.rewardName || ""
    ]);
  }
  return workbook.xlsx.writeBuffer();
};

module.exports = {
  getSummaryStats,
  getDashboardStats,
  getPointsOutstandingCenti,
  getPointsExpiredCenti,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
  buildTransactionsWorkbook,
  resolveDateRange
};
