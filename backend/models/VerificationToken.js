const mongoose = require("mongoose");

// Backs email verification and password reset. Tenant-scoped. Looked up by
// tokenHash equality so the in-memory mock DB can serve it. Single-use via usedAt.
const VerificationTokenSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["email_verify", "password_reset"], required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("VerificationToken", VerificationTokenSchema);
