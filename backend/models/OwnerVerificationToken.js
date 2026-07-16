const mongoose = require("mongoose");

// Backs global email verification and password reset for BusinessOwnerAccount
// — mirrors AccountVerificationToken.js exactly, keyed by ownerAccountId
// instead of customerAccountId. Kept as its own model rather than reused
// cross-purpose, matching this codebase's existing pattern of one token
// model per global identity type.
const OwnerVerificationTokenSchema = new mongoose.Schema({
  ownerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessOwnerAccount", required: true },
  type: { type: String, enum: ["email_verify", "password_reset"], required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("OwnerVerificationToken", OwnerVerificationTokenSchema);
