const {
  getSummaryStats,
  getDashboardStats,
  getVoucherPerformanceStats,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
  buildVoucherPerformanceWorkbook,
} = require("../services/reportService");

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

const getVoucherPerformance = async (req, res, next) => {
  try {
    const stats = await getVoucherPerformanceStats(req.user.organizationId, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
};

const downloadVoucherPerformance = async (req, res, next) => {
  try {
    const stats = await getVoucherPerformanceStats(req.user.organizationId, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    const buffer = await buildVoucherPerformanceWorkbook(stats);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"voucher-performance-report.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getSummary,
  downloadSummary,
  downloadCustomers,
  getVoucherPerformance,
  downloadVoucherPerformance,
};
