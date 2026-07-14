const { generateQRToken, claimStamp, getStampBalanceByUserId } = require("../services/stampService");
const StampClaimEvent = require("../models/StampClaimEvent");
const User = require("../models/User");
const StampCard = require("../models/StampCard");
const Voucher = require("../models/Voucher");

const generateAdminQRToken = async (req, res, next) => {
  try {
    const result = await generateQRToken(req.user.id, req.user.organizationId);
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
    const organizationId = req.user.organizationId;
    const customers = await User.find({ role: "customer", organizationId }).sort({ name: 1 });

    const data = await Promise.all(
      customers.map(async (customer) => {
        const stampCard = await StampCard.findOne({ userId: customer._id, organizationId });
        const stampsEarned = stampCard ? stampCard.stampsEarned : 0;
        const lastStampedAt = stampCard ? stampCard.lastStampedAt : null;

        const validVoucherCount = (
          await Voucher.find({
            userId: customer._id,
            organizationId,
            isValid: true,
          })
        ).length;

        const events = await StampClaimEvent.find({ userId: customer._id, organizationId })
          .sort({ createdAt: -1 })
          .limit(10);

        const scanHistory = events.map((event) => ({
          id: event._id.toString(),
          timestamp: event.createdAt,
        }));

        const idStr = customer._id.toString();
        const suffix = idStr.substring(Math.max(0, idStr.length - 5)).toUpperCase();
        const formattedId = `NO. ${suffix.padStart(5, '0')}`;

        return {
          id: idStr,
          name: customer.name,
          email: customer.email,
          customerNo: formattedId,
          stampsEarned,
          lastStampedAt,
          validVoucherCount,
          scanHistory,
        };
      })
    );

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
