const ExcelJS = require("exceljs");
const User = require("../models/User");
const Voucher = require("../models/Voucher");
const StampClaimEvent = require("../models/StampClaimEvent");
const { getCustomerDetailRows } = require("./stampService");

const DAY_MS = 24 * 60 * 60 * 1000;

// Parses "YYYY-MM-DD" query params into a [start, end] Date range, defaulting
// to the last 30 days when either is missing or invalid.
const resolveDateRange = (startDateParam, endDateParam) => {
  const now = new Date();
  let start = startDateParam ? new Date(startDateParam) : null;
  let end = endDateParam ? new Date(endDateParam) : null;

  if (!start || Number.isNaN(start.getTime())) {
    start = new Date(now.getTime() - 30 * DAY_MS);
  }
  if (!end || Number.isNaN(end.getTime())) {
    end = now;
  } else {
    // Treat the end date as inclusive of its whole day.
    end = new Date(end.getTime() + DAY_MS - 1);
  }

  return { start, end };
};

const getSummaryStats = async (organizationId, { startDate, endDate } = {}) => {
  const { start, end } = resolveDateRange(startDate, endDate);
  const range = { $gte: start, $lte: end };

  const newCustomers = await User.countDocuments({
    role: "customer",
    organizationId,
    createdAt: range,
  });

  const stampsIssued = await StampClaimEvent.countDocuments({
    organizationId,
    createdAt: range,
  });

  const vouchersEarned = await Voucher.countDocuments({
    organizationId,
    earnedAt: range,
  });

  const vouchersRedeemed = await Voucher.countDocuments({
    organizationId,
    isValid: false,
    redeemedAt: range,
  });

  const eventsInRange = await StampClaimEvent.find({ organizationId, createdAt: range });
  const totalRevenue = eventsInRange.reduce((sum, e) => sum + (e.billAmount || 0), 0);

  return {
    newCustomers,
    stampsIssued,
    vouchersEarned,
    vouchersRedeemed,
    totalRevenue,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
};

const WEEK_MS = 7 * DAY_MS;

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

// Week-over-week % change. Only meaningful for flow metrics (counted within
// a window) — undefined (null) when the prior window was zero and the
// current one isn't, since a percentage off zero is not a real number.
const weekOverWeekTrend = (current, previous) => {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? null : 0;
};

// Backs the Admin Dashboard's 4 KPI tiles + 2 charts. Every number here is
// real — no fabricated trend/activity data. Mock DB has no aggregation
// pipeline, so day/week bucketing is done with plain find() + JS loops
// (mirrors the precedent in stampService.getCustomerDetailRows).
const getDashboardStats = async (organizationId) => {
  const now = new Date();
  const currentStart = new Date(now.getTime() - WEEK_MS);
  const previousStart = new Date(now.getTime() - 2 * WEEK_MS);
  const currentRange = { $gte: currentStart, $lte: now };
  const previousRange = { $gte: previousStart, $lte: currentStart };

  const [
    newCustomersCurrent,
    newCustomersPrevious,
    stampsCurrent,
    stampsPrevious,
    activeVouchers,
    eventsCurrent,
    eventsPrevious,
  ] = await Promise.all([
    User.countDocuments({ role: "customer", organizationId, createdAt: currentRange }),
    User.countDocuments({ role: "customer", organizationId, createdAt: previousRange }),
    StampClaimEvent.countDocuments({ organizationId, createdAt: currentRange }),
    StampClaimEvent.countDocuments({ organizationId, createdAt: previousRange }),
    Voucher.countDocuments({
      organizationId,
      isValid: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }]
    }),
    StampClaimEvent.find({ organizationId, createdAt: currentRange }),
    StampClaimEvent.find({ organizationId, createdAt: previousRange }),
  ]);

  const revenueCurrent = eventsCurrent.reduce((sum, e) => sum + (e.billAmount || 0), 0);
  const revenuePrevious = eventsPrevious.reduce((sum, e) => sum + (e.billAmount || 0), 0);

  // Stamp Velocity: stamps issued per day, last 14 days.
  const velocityStart = new Date(now.getTime() - 14 * DAY_MS);
  const velocityEvents = await StampClaimEvent.find({
    organizationId,
    createdAt: { $gte: velocityStart, $lte: now },
  });
  const velocityByDay = new Map();
  for (let i = 13; i >= 0; i -= 1) {
    velocityByDay.set(dayKey(new Date(now.getTime() - i * DAY_MS)), 0);
  }
  for (const event of velocityEvents) {
    const key = dayKey(event.createdAt);
    if (velocityByDay.has(key)) velocityByDay.set(key, velocityByDay.get(key) + 1);
  }
  const stampVelocity = Array.from(velocityByDay.entries()).map(([date, count]) => ({ date, count }));

  // Voucher Activity: earned vs. redeemed counts per week, last 8 weeks.
  const activityStart = new Date(now.getTime() - 8 * WEEK_MS);
  const vouchersInWindow = await Voucher.find({
    organizationId,
    $or: [
      { earnedAt: { $gte: activityStart, $lte: now } },
      { redeemedAt: { $gte: activityStart, $lte: now } },
    ],
  });
  const weekBuckets = [];
  for (let i = 7; i >= 0; i -= 1) {
    weekBuckets.push({
      weekStart: new Date(now.getTime() - (i + 1) * WEEK_MS),
      weekEnd: new Date(now.getTime() - i * WEEK_MS),
      earned: 0,
      redeemed: 0,
    });
  }
  for (const voucher of vouchersInWindow) {
    const earnedAt = voucher.earnedAt ? new Date(voucher.earnedAt).getTime() : null;
    const redeemedAt = voucher.redeemedAt ? new Date(voucher.redeemedAt).getTime() : null;
    for (const bucket of weekBuckets) {
      const startMs = bucket.weekStart.getTime();
      const endMs = bucket.weekEnd.getTime();
      if (earnedAt !== null && earnedAt >= startMs && earnedAt < endMs) bucket.earned += 1;
      if (redeemedAt !== null && redeemedAt >= startMs && redeemedAt < endMs) bucket.redeemed += 1;
    }
  }
  const voucherActivity = weekBuckets.map((b) => ({
    weekStart: b.weekStart.toISOString().slice(0, 10),
    earned: b.earned,
    redeemed: b.redeemed,
  }));

  return {
    newCustomers: { value: newCustomersCurrent, trend: weekOverWeekTrend(newCustomersCurrent, newCustomersPrevious) },
    stampsIssued: { value: stampsCurrent, trend: weekOverWeekTrend(stampsCurrent, stampsPrevious) },
    revenue: { value: revenueCurrent, trend: weekOverWeekTrend(revenueCurrent, revenuePrevious) },
    activeVouchers: { value: activeVouchers, trend: null },
    stampVelocity,
    voucherActivity,
  };
};

// Voucher Performance report. Cohort-scoped: every voucher *earned* within
// the date range, checked for redemption regardless of when that happened.
// (Deliberately not "redeemed in range" as a separate population — mixing
// two independently date-filtered sets would make "redemption rate"
// mathematically incoherent.)
const getVoucherPerformanceStats = async (organizationId, { startDate, endDate } = {}) => {
  const { start, end } = resolveDateRange(startDate, endDate);
  const range = { $gte: start, $lte: end };

  const cohort = await Voucher.find({ organizationId, earnedAt: range });

  let totalRedeemed = 0;
  let totalRedeemDays = 0;
  const rows = cohort.map((voucher) => {
    const isRedeemed = Boolean(voucher.redeemedAt);
    let daysToRedeem = null;
    if (isRedeemed) {
      daysToRedeem = Math.round(
        (new Date(voucher.redeemedAt).getTime() - new Date(voucher.earnedAt).getTime()) / DAY_MS
      );
      totalRedeemed += 1;
      totalRedeemDays += daysToRedeem;
    }
    return {
      voucherCode: voucher.voucherCode,
      earnedAt: new Date(voucher.earnedAt).toISOString().slice(0, 10),
      redeemedAt: isRedeemed ? new Date(voucher.redeemedAt).toISOString().slice(0, 10) : null,
      status: isRedeemed ? "redeemed" : "pending",
      daysToRedeem,
    };
  });

  const totalEarned = cohort.length;
  const totalPending = totalEarned - totalRedeemed;
  const redemptionRate = totalEarned > 0 ? Math.round((totalRedeemed / totalEarned) * 100) : 0;
  const avgDaysToRedeem = totalRedeemed > 0 ? Math.round((totalRedeemDays / totalRedeemed) * 10) / 10 : null;

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    totalEarned,
    totalRedeemed,
    totalPending,
    redemptionRate,
    avgDaysToRedeem,
    rows,
  };
};

const buildVoucherPerformanceWorkbook = async (stats) => {
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRow(["Metric", "Value"]);
  summarySheet.addRow(["Date range", `${stats.startDate} to ${stats.endDate}`]);
  summarySheet.addRow(["Vouchers earned", stats.totalEarned]);
  summarySheet.addRow(["Vouchers redeemed", stats.totalRedeemed]);
  summarySheet.addRow(["Vouchers pending", stats.totalPending]);
  summarySheet.addRow(["Redemption rate (%)", stats.redemptionRate]);
  summarySheet.addRow(["Avg days to redeem", stats.avgDaysToRedeem ?? "N/A"]);

  const detailSheet = workbook.addWorksheet("Vouchers");
  detailSheet.addRow(["Voucher Code", "Earned", "Redeemed", "Status", "Days to Redeem"]);
  for (const row of stats.rows) {
    detailSheet.addRow([row.voucherCode, row.earnedAt, row.redeemedAt || "", row.status, row.daysToRedeem ?? ""]);
  }

  return workbook.xlsx.writeBuffer();
};

const buildSummaryWorkbook = async (stats) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Summary");
  sheet.addRow(["Metric", "Value"]);
  sheet.addRow(["Date range", `${stats.startDate} to ${stats.endDate}`]);
  sheet.addRow(["New customers", stats.newCustomers]);
  sheet.addRow(["Stamps issued", stats.stampsIssued]);
  sheet.addRow(["Vouchers earned", stats.vouchersEarned]);
  sheet.addRow(["Vouchers redeemed", stats.vouchersRedeemed]);
  sheet.addRow(["Total revenue", stats.totalRevenue]);
  return workbook.xlsx.writeBuffer();
};

const buildCustomersWorkbook = async (organizationId) => {
  const rows = await getCustomerDetailRows(organizationId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customers");
  sheet.addRow(["Name", "Email", "Phone", "Address", "Customer #", "Current Stamps", "Lifetime Vouchers", "Total Spent", "Last Visit"]);
  for (const r of rows) {
    sheet.addRow([
      r.name,
      r.email,
      r.phone,
      r.address,
      r.customerNo,
      r.stampsEarned,
      r.lifetimeVoucherCount,
      r.totalSpent,
      r.lastStampedAt ? new Date(r.lastStampedAt).toISOString().slice(0, 10) : "",
    ]);
  }
  return workbook.xlsx.writeBuffer();
};

module.exports = {
  getSummaryStats,
  getDashboardStats,
  getVoucherPerformanceStats,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
  buildVoucherPerformanceWorkbook,
};
