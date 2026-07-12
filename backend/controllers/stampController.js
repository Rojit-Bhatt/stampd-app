const { generateQRToken, claimStamp, getStampBalanceByUserId } = require("../services/stampService");
const StampClaimEvent = require("../models/StampClaimEvent");

const generateAdminQRToken = async (req, res, next) => {
  try {
    const result = await generateQRToken(req.user.id);
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
      role: req.user.role
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getStampBalance = async (req, res, next) => {
  try {
    const result = await getStampBalanceByUserId(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRecentScans = async (req, res, next) => {
  try {
    const events = await StampClaimEvent.find()
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

module.exports = {
  generateAdminQRToken,
  claimCustomerStamp,
  getStampBalance,
  getRecentScans
};
