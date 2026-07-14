const XLSX = require("xlsx");
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

const buildSummaryWorkbook = (stats) => {
  const aoa = [
    ["Metric", "Value"],
    ["Date range", `${stats.startDate} to ${stats.endDate}`],
    ["New customers", stats.newCustomers],
    ["Stamps issued", stats.stampsIssued],
    ["Vouchers earned", stats.vouchersEarned],
    ["Vouchers redeemed", stats.vouchersRedeemed],
    ["Total revenue", stats.totalRevenue],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Summary");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

const buildCustomersWorkbook = async (organizationId) => {
  const rows = await getCustomerDetailRows(organizationId);

  const aoa = [
    ["Name", "Email", "Phone", "Address", "Customer #", "Current Stamps", "Lifetime Vouchers", "Total Spent", "Last Visit"],
    ...rows.map((r) => [
      r.name,
      r.email,
      r.phone,
      r.address,
      r.customerNo,
      r.stampsEarned,
      r.lifetimeVoucherCount,
      r.totalSpent,
      r.lastStampedAt ? new Date(r.lastStampedAt).toISOString().slice(0, 10) : "",
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Customers");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

module.exports = {
  getSummaryStats,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
};
