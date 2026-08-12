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
const { TIER_LABELS, PLATFORM_TIMEZONE } = require("../config/platform");

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

// Midnight, in PLATFORM_TIMEZONE, of the day `date` falls on — as a real UTC
// instant usable in a Mongo-style {$gte, $lte} range. Not `date.getHours()`
// tricks: the server runs in UTC in production, and Nepal is UTC+5:45, so a
// naive UTC midnight would cut "today" off 5h45m early for a Nepali business
// (the same reasoning campaignService.localDayOfWeek already documents for
// campaign day-of-week checks).
const startOfLocalDay = (date, timeZone = PLATFORM_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});

  // The instant `date` reads as this wall-clock time in `timeZone`. The gap
  // between that wall-clock reading (misinterpreted as UTC) and the real UTC
  // instant IS the timezone offset at this moment (handles DST correctly
  // since it's derived from the real instant, not a fixed +5:45 constant).
  const wallClockAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  const offsetMs = wallClockAsUtc - date.getTime();

  const localMidnightAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0);
  return new Date(localMidnightAsUtc - offsetMs);
};

// Week-over-week % change. Only meaningful for flow metrics (counted within
// a window) — undefined (null) when the prior window was zero and the
// current one isn't, since a percentage off zero is not a real number.
const weekOverWeekTrend = (current, previous) => {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? null : 0;
};

// Backs the Admin Dashboard's 4 KPI tiles + 2 charts. newCustomers/
// pointsIssued/revenue cover TODAY (midnight-to-now in PLATFORM_TIMEZONE)
// vs YESTERDAY for the trend badge — not a rolling week. Every number here
// is real — no fabricated trend/activity data. The mock DB has no
// aggregation pipeline, so day/week bucketing is plain find() + JS loops.
const getDashboardStats = async (organizationId) => {
  const now = new Date();
  const currentStart = startOfLocalDay(now);
  const previousStart = new Date(currentStart.getTime() - DAY_MS);
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
    weekStart: b.weekEnd.toISOString().slice(0, 10),
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

const getTierDistributionStats = async (organizationId) => {
  const rows = await getCustomerDetailRows(organizationId);
  const counts = { untiered: 0 };
  for (const label of TIER_LABELS) counts[label] = 0;

  for (const row of rows) {
    if (row.tier && Object.prototype.hasOwnProperty.call(counts, row.tier)) {
      counts[row.tier] += 1;
    } else {
      counts.untiered += 1;
    }
  }

  return counts;
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
    "Points Balance", "Lifetime Points", "Redemptions", "Total Spent", "Last Activity", "Tier"
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
      r.lastActivityAt ? new Date(r.lastActivityAt).toISOString().slice(0, 10) : "",
      r.tier || "—"
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

// One ledger pass over the range's redeem rows. Rows are rendered newest
// first — the redeem page is a ledger, and the newest redemptions are the
// ones an admin reaches for first. `topItem` picks the most-redeemed
// rewardName; ties go to whichever name surfaces first, which is fine for a
// tiebreaker.
const getRedeemStats = async (organizationId, { startDate, endDate } = {}) => {
  const { start, end } = resolveDateRange(startDate, endDate);
  const range = { $gte: start, $lte: end };

  const txns = await PointsTransaction.find({ organizationId, type: "redeem", createdAt: range });

  const rows = txns
    .map((t) => ({
      date: new Date(t.createdAt).toISOString().slice(0, 16).replace("T", " "),
      customer: t.performedByName || "Unknown",
      item: t.rewardName || "",
      points: toPoints(-t.pointsCenti),
      value: t.rewardValueNpr ?? null
    }))
    .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

  const totalPointsRedeemed = toPoints(-sumCenti(txns));
  const uniqueCustomers = new Set(txns.map((t) => t.userId.toString())).size;

  const itemCounts = new Map();
  for (const t of txns) {
    const name = t.rewardName || "Unknown";
    itemCounts.set(name, (itemCounts.get(name) || 0) + 1);
  }
  let topItem = null;
  let topCount = 0;
  for (const [name, count] of itemCounts) {
    if (count > topCount) {
      topCount = count;
      topItem = name;
    }
  }

  // Daily series: every day in the range gets a bucket (even empty ones —
  // the chart must show the quiet days, not skip them).
  const byDay = new Map();
  const d = new Date(startOfLocalDay(start));
  const lastDay = startOfLocalDay(end);
  while (d.getTime() <= lastDay.getTime() + DAY_MS) {
    byDay.set(dayKey(d), { date: dayKey(d), redemptions: 0, points: 0 });
    d.setDate(d.getDate() + 1);
  }
  for (const t of txns) {
    const bucket = byDay.get(dayKey(t.createdAt));
    if (bucket) {
      bucket.redemptions += 1;
      bucket.points += -t.pointsCenti / 100;
    }
  }

  return {
    rows,
    totalRedemptions: txns.length,
    totalPointsRedeemed,
    uniqueCustomers,
    topItem,
    daily: Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
};

// The redeem page's spreadsheet export — same headers as the on-screen
// table, so the download is a faithful copy of what the admin just filtered.
const buildRedeemsWorkbook = async (organizationId, { startDate, endDate } = {}) => {
  const stats = await getRedeemStats(organizationId, { startDate, endDate });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Redemptions");
  sheet.addRow(["When", "Customer", "Item / Reward", "Points Redeemed", "Value (Rs)"]);
  for (const r of stats.rows) {
    sheet.addRow([r.date, r.customer, r.item, r.points, r.value ?? ""]);
  }
  return workbook.xlsx.writeBuffer();
};

module.exports = {
  getSummaryStats,
  getDashboardStats,
  getTierDistributionStats,
  getPointsOutstandingCenti,
  getPointsExpiredCenti,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
  buildTransactionsWorkbook,
  getRedeemStats,
  buildRedeemsWorkbook,
  resolveDateRange
};
