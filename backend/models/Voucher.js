const mongoose = require("mongoose");

const VoucherSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  voucherCode: { type: String, required: true, unique: true },
  isValid: { type: Boolean, default: true },
  earnedAt: { type: Date, default: Date.now },
  redeemedAt: { type: Date, default: null }
});

module.exports = mongoose.model("Voucher", VoucherSchema);
