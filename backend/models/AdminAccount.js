const mongoose = require("mongoose");

// The single credential collection for ALL business-side staff — company
// owners and outlet admins alike. Platform super-admins are not here; they
// remain User rows with role "platform".
//
// One collection is the whole point: `email` is unique across every company
// and every outlet, which is what lets the unified slug-less admin login
// (adminAuthService.adminLogin) resolve an email to exactly one identity and
// branch on `kind`. Splitting these credentials across two collections would
// make that uniqueness unenforceable — MongoDB has no cross-collection
// unique index.
//
// This mirrors the CustomerAccount pattern one layer up: an AdminAccount is
// the global identity, and (for outlet admins) a tenant-scoped User row with
// role "business_admin" is the membership that actually carries the tenant
// JWT — see User.adminAccountId.
const AdminAccountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, required: false },
  googleId: { type: String, default: null },
  phone: { type: String, trim: true, default: "" },
  emailVerified: { type: Boolean, default: false },
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  // Mirrors CustomerAccount.passwordVersion: every JWT minted from this
  // account embeds the current version, and verification rejects any token
  // minted under an older version — so a stolen admin token dies instantly
  // on a password change or reset, with no revocation table.
  passwordVersion: { type: Number, default: 0 },
  // Optional TOTP-based MFA behind ENABLE_MFA; encrypted at rest via
  // AES-256-GCM (never stored plaintext or hashed — disable must verify
  // a code against the original secret). Shared helpers, see mfaService
  // (keyed by AdminAccount for admin-side logins).
  mfaEnabled: { type: Boolean, default: false },
  mfaSecretEncrypted: { type: String, default: null },

  // company_owner -> manages the company, its outlets and its subscription;
  //                  organizationId is null (owns all of them, not one).
  // outlet_admin   -> runs exactly one outlet's console; organizationId set.
  kind: { type: String, enum: ["company_owner", "outlet_admin"], required: true },

  // Only meaningful when kind === "outlet_admin". null/unset means FULL
  // access, including managing other staff — deliberate, so every outlet
  // admin that existed before this field keeps working with no migration.
  // Exactly the convention User.platformRole already uses one layer up.
  //
  //   null      -> the outlet's primary admin. Everything.
  //   "manager" -> everything except managing other staff.
  //   "staff"   -> the counter only: generate an earn QR, generate a redeem QR.
  //
  // The enum lists only the two ASSIGNABLE values. null is reachable as a
  // default but is never something a client can set: an outlet has exactly
  // one primary admin, created with the outlet.
  staffRole: { type: String, enum: ["manager", "staff"], default: null },

  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  // Null for a company_owner. Set for an outlet_admin — the one outlet it
  // administers.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },

  createdAt: { type: Date, default: Date.now }
});

// The whole staff email namespace, in one enforceable index.
AdminAccountSchema.index({ email: 1 }, { unique: true });
AdminAccountSchema.index({ companyId: 1, kind: 1 });
// One PRIMARY admin per outlet. This used to be "one admin account per
// outlet" full stop; sub-admins end that, but the intent behind it — one
// unambiguous primary, so "the outlet's admin" is a well-defined lookup —
// survives, expressed more precisely. Managers and staff (staffRole set) are
// unconstrained.
//
// Indexes are not enforced by the mock DB, so this is ALSO asserted in the
// service: staffService.createStaff always writes a non-null staffRole, and
// no code path assigns null.
AdminAccountSchema.index(
  { organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organizationId: { $type: "objectId" },
      staffRole: null
    }
  }
);

module.exports = mongoose.model("AdminAccount", AdminAccountSchema);
