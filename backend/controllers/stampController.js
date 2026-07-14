const { generateQRToken, claimStamp, getStampBalanceByUserId, getCustomerDetailRows } = require("../services/stampService");
const StampClaimEvent = require("../models/StampClaimEvent");

const generateAdminQRToken = async (req, res, next) => {
  try {
    const result = await generateQRToken(req.user.id, req.user.organizationId, req.body.billAmount);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const claimCustomerStamp = async (req, res, next) => {
  try {
    const result = await claimStamp({
      token: req.body.token,
      userId: req.user.id,
      role: req.user.role,
      organizationId: req.user.organizationId
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getStampBalance = async (req, res, next) => {
  try {
    const result = await getStampBalanceByUserId(req.user.id, req.user.organizationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRecentScans = async (req, res, next) => {
  try {
    const events = await StampClaimEvent.find({ organizationId: req.user.organizationId })
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(50);

    const scans = events
      .filter(e => e.userId !== null && e.userId !== undefined)
      .map(e => ({
        id: e._id.toString(),
        timestamp: e.createdAt,
        customerName: e.userId.name || "Customer",
        status: "credited"
      }));

    res.status(200).json({ success: true, data: scans });
  } catch (error) {
    next(error);
  }
};

const getCustomersList = async (req, res, next) => {
  try {
    const data = await getCustomerDetailRows(req.user.organizationId);

    // Sort by last activity (most recent first)
    data.sort((a, b) => {
      const dateA = a.lastStampedAt ? new Date(a.lastStampedAt) : new Date(0);
      const dateB = b.lastStampedAt ? new Date(b.lastStampedAt) : new Date(0);
      return dateB - dateA;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateAdminQRToken,
  claimCustomerStamp,
  getStampBalance,
  getRecentScans,
  getCustomersList
};
