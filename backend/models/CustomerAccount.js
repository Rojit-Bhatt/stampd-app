const mongoose = require("mongoose");

// The single global identity for a customer, shared across every tenant they
// interact with. Owns email/password/phone/name/emailVerified/googleId.
// Per-tenant loyalty state (PointsBalance/PointsTransaction) stays on the
// tenant-scoped User "membership" row — see User.customerAccountId.
const CustomerAccountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  googleId: { type: String, default: null },
  password: { type: String, required: false },
  phone: { type: String, trim: true, default: "" },
  emailVerified: { type: Boolean, default: false },
  // Bumped on every avatar upload/removal; 0 means no picture. The image
  // itself lives in CustomerAvatar — this is the cheap flag that travels with
  // the account, and the cache-buster that lets the served image be marked
  // immutable (see the avatar endpoint in customerAccountController).
  avatarVersion: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// The in-memory mock DB used in dev/test doesn't enforce `unique` indexes —
// global-uniqueness is enforced by an explicit findOne check in
// customerAccountService, same pattern authService.registerUser already
// relies on for its own (tenant-scoped) uniqueness today.
CustomerAccountSchema.index({ email: 1 }, { unique: true });
CustomerAccountSchema.index({ googleId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("CustomerAccount", CustomerAccountSchema);
