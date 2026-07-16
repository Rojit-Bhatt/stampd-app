const mongoose = require("mongoose");

const VoucherSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  voucherCode: { type: String, required: true, unique: true },
  isValid: { type: Boolean, default: true },
  earnedAt: { type: Date, default: Date.now },
  redeemedAt: { type: Date, default: null },
  // null = never expires. Set at creation time from the earning tenant's
  // program.voucherExpiryDays; never recomputed after the voucher exists.
  expiresAt: { type: Date, default: null }
});

VoucherSchema.index({ organizationId: 1, userId: 1 });

module.exports = mongoose.model("Voucher", VoucherSchema);
