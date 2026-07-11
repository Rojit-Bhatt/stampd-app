const Voucher = require("../models/Voucher");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getMyWallet = async ({ userId, role }) => {
  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  if (role !== "customer") {
    throw createHttpError("Only customers can access voucher wallet.", 403);
  }

  const vouchers = await Voucher.find(
    { userId, isValid: true },
    { _id: 0, voucherCode: 1, isValid: 1, earnedAt: 1 }
  ).sort({ earnedAt: -1 });

  return {
    success: true,
    vouchers
  };
};

const redeemVoucher = async ({ voucherCode }) => {
  if (!voucherCode) {
    throw createHttpError("Voucher code is required.", 400);
  }

  const normalizedCode = voucherCode.trim().toUpperCase();
  const now = new Date();

  const redeemedVoucher = await Voucher.findOneAndUpdate(
    { voucherCode: normalizedCode, isValid: true },
    { $set: { isValid: false, redeemedAt: now } },
    { new: true }
  );

  if (!redeemedVoucher) {
    const voucher = await Voucher.findOne({ voucherCode: normalizedCode });

    if (!voucher) {
      throw createHttpError("Voucher code not found.", 404);
    }

    throw createHttpError("Voucher is already redeemed or invalid.", 400);
  }

  return {
    success: true,
    message: "Voucher successfully redeemed. Dispense free coffee reward."
  };
};

module.exports = {
  getMyWallet,
  redeemVoucher
};
