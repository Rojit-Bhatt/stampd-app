const mongoose = require("mongoose");

// Backs email verification and password reset for every AdminAccount —
// company owners and outlet admins alike (decision: an outlet's credentials
// are verified once, by whoever the company owner handed them to). Mirrors
// AccountVerificationToken.js exactly, keyed by adminAccountId.
//
// Kept as its own model rather than reused cross-purpose, matching this
// codebase's pattern of one token model per identity type.
const AdminVerificationTokenSchema = new mongoose.Schema({
  adminAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminAccount", required: true },
  type: { type: String, enum: ["email_verify", "password_reset"], required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AdminVerificationToken", AdminVerificationTokenSchema);
