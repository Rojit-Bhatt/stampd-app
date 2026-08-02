const {
  getSummaryStats,
  getDashboardStats,
  getTierDistributionStats,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
  buildTransactionsWorkbook,
} = require("../services/reportService");
const { getLeaderboard } = require("../services/leaderboardService");

const getDashboard = async (req, res, next) => {
  try {
    const stats = await getDashboardStats(req.user.organizationId);
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const stats = await getSummaryStats(req.user.organizationId, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
};

const getTierDistribution = async (req, res, next) => {
  try {
    const stats = await getTierDistributionStats(req.user.organizationId);
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
};

const getLeaderboardReport = async (req, res, next) => {
  try {
    const window = req.query.window || "all";
    const rows = await getLeaderboard(req.user.organizationId, { window });
    res.status(200).json({ success: true, data: { window, rows } });
  } catch (error) {
    next(error);
  }
};

const downloadSummary = async (req, res, next) => {
  try {
    const stats = await getSummaryStats(req.user.organizationId, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    const buffer = await buildSummaryWorkbook(stats);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"summary-report.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const downloadCustomers = async (req, res, next) => {
  try {
    const buffer = await buildCustomersWorkbook(req.user.organizationId);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"customers-report.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const downloadTransactions = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const buffer = await buildTransactionsWorkbook(req.user.organizationId, { startDate, endDate });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"transactions-report.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getSummary,
  getTierDistribution,
  getLeaderboardReport,
  downloadSummary,
  downloadCustomers,
  downloadTransactions,
};
