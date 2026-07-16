const Voucher = require("../models/Voucher");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getMyWallet = async ({ userId, role, organizationId }) => {
  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  if (role !== "customer") {
    throw createHttpError("Only customers can access voucher wallet.", 403);
  }

  const vouchers = await Voucher.find(
    { userId, organizationId, isValid: true },
    { _id: 0, voucherCode: 1, isValid: 1, earnedAt: 1, expiresAt: 1 }
  ).sort({ earnedAt: -1 });

  return {
    success: true,
    vouchers
  };
};

const redeemVoucher = async ({ voucherCode, organizationId }) => {
  if (!voucherCode) {
    throw createHttpError("Voucher code is required.", 400);
  }

  const normalizedCode = voucherCode.trim().toUpperCase();
  const now = new Date();

  const redeemedVoucher = await Voucher.findOneAndUpdate(
    { voucherCode: normalizedCode, organizationId, isValid: true },
    { $set: { isValid: false, redeemedAt: now } },
    { new: true }
  );

  if (!redeemedVoucher) {
    const voucher = await Voucher.findOne({ voucherCode: normalizedCode, organizationId });

    if (!voucher) {
      throw createHttpError("Voucher code not found.", 404);
    }

    throw createHttpError("Voucher is already redeemed or invalid.", 400);
  }

  // Caught the expiry after the fact: undo the redemption timestamp (this
  // voucher was consumed, not honored) and reject.
  if (redeemedVoucher.expiresAt && redeemedVoucher.expiresAt < now) {
    await Voucher.findOneAndUpdate(
      { voucherCode: normalizedCode, organizationId },
      { $set: { redeemedAt: null } }
    );
    throw createHttpError("This voucher's expired.", 400);
  }

  return {
    success: true,
    message: "Voucher successfully redeemed. Dispense the reward."
  };
};

module.exports = {
  getMyWallet,
  redeemVoucher
};
