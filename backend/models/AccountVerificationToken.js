const mongoose = require("mongoose");

// Backs global email verification and password reset for CustomerAccount —
// mirrors VerificationToken.js exactly, minus organizationId/userId, keyed by
// customerAccountId instead. VerificationToken.js is left untouched; it still
// backs the legacy tenant-scoped business_admin/platform flows.
const AccountVerificationTokenSchema = new mongoose.Schema({
  customerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerAccount", required: true },
  type: { type: String, enum: ["email_verify", "password_reset"], required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AccountVerificationToken", AccountVerificationTokenSchema);
