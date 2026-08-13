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
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  // Bumped on every avatar upload/removal; 0 means no picture. The image
  // itself lives in CustomerAvatar — this is the cheap flag that travels with
  // the account, and the cache-buster that lets the served image be marked
  // immutable (see the avatar endpoint in customerAccountController).
  avatarVersion: { type: Number, default: 0 },
  // Revocation counter signed into every global session token this account
  // mints. Bumped on password change so previously-issued tokens — still
  // within their lifetime — are rejected by verifyGlobalSessionToken's
  // version check: instant logout after a credential change, no token list.
  sessionVersion: { type: Number, default: 0 },
  marketingConsent: {
    email: {
      granted: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null }
    },
    sms: {
      granted: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null }
    },
    whatsapp: {
      granted: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null }
    },
    push: {
      granted: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null }
    }
  },
  birthdayMonth: { type: Number, min: 1, max: 12, default: null },
  birthdayDay: { type: Number, min: 1, max: 31, default: null },
  gender: {
    type: String,
    enum: ["male", "female", "other", "prefer_not_to_say", null],
    default: null
  },
  createdAt: { type: Date, default: Date.now }
});

// The in-memory mock DB used in dev/test doesn't enforce `unique` indexes —
// global-uniqueness is enforced by an explicit findOne check in
// customerAccountService, same pattern authService.registerUser already
// relies on for its own (tenant-scoped) uniqueness today.
CustomerAccountSchema.index({ email: 1 }, { unique: true });
CustomerAccountSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: "string" } } }
);

module.exports = mongoose.model("CustomerAccount", CustomerAccountSchema);
