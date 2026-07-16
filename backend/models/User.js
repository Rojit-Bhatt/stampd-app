const mongoose = require("mongoose");

// Roles:
//   platform       -> super-admin who owns the SaaS and onboards businesses (organizationId = null)
//   business_admin -> a tenant's admin/barista (organizationId set)
//   customer       -> an end customer of a specific tenant (organizationId set)
const UserSchema = new mongoose.Schema({
  // Tenant this user belongs to. Null only for platform super-admins.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  googleId: { type: String, default: null },
  password: { type: String, required: false },
  phone: {
    type: String,
    trim: true,
    default: "",
    // Required for customers only; enforced again in authService for the mock DB
    // (which does not run validators).
    required: function () {
      return this.role === "customer";
    }
  },
  address: { type: String, trim: true, default: "" },
  emailVerified: { type: Boolean, default: false },
  role: { type: String, enum: ["customer", "business_admin", "platform"], default: "customer" },
  // Only meaningful when role === "platform". null/unset is treated as
  // "owner" everywhere it's read — this is deliberate so the existing
  // seeded admin (created before this field existed) keeps full access
  // with no migration needed.
  platformRole: { type: String, enum: ["owner", "support"], default: null },
  // Set only for role==="customer" rows — links this tenant-scoped
  // "membership" row to its global CustomerAccount (identity/password now
  // lives there; name/phone/emailVerified here are denormalized copies kept
  // in sync by customerAccountService.ensureMembership). Always null for
  // business_admin/platform, which have no CustomerAccount and keep
  // authenticating via this row's own password exactly as before.
  customerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerAccount", default: null },
  // Set only for role==="business_admin" rows — links this tenant-scoped
  // membership to its global AdminAccount, the exact analogue of
  // customerAccountId above. The password lives on the AdminAccount, never
  // here: a business_admin User row is a membership, not a credential.
  adminAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminAccount", default: null },
  // Denormalized from the AdminAccount's outlet, so a company owner's
  // outlet list and the login's redirect are one query. Null for
  // customer/platform rows.
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
  createdAt: { type: Date, default: Date.now }
});

// Email is unique PER organization (the same person can be a customer at two
// different businesses). Platform admins share the null-org namespace.
UserSchema.index({ organizationId: 1, email: 1 }, { unique: true });
UserSchema.index({ organizationId: 1, googleId: 1 }, { unique: true, sparse: true });
// One membership per (account, org). A partial filter is required instead of
// `sparse` — business_admin/platform rows have customerAccountId present but
// explicitly null, which sparse would NOT exclude, so multiple such rows in
// the same org would otherwise collide on {organizationId, null}.
UserSchema.index(
  { organizationId: 1, customerAccountId: 1 },
  { unique: true, partialFilterExpression: { customerAccountId: { $type: "objectId" } } }
);
// One business_admin membership per (org, admin account) — same partial-filter
// reasoning as the customerAccountId index above. Global staff email
// uniqueness is deliberately NOT enforced here: it lives on AdminAccount,
// where a single collection makes it actually indexable. Emails on this
// collection must stay non-unique globally, because a customer legitimately
// holds one membership row per outlet, all carrying the same email.
UserSchema.index(
  { organizationId: 1, adminAccountId: 1 },
  { unique: true, partialFilterExpression: { adminAccountId: { $type: "objectId" } } }
);

module.exports = mongoose.model("User", UserSchema);
