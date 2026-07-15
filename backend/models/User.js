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
  // Set only for role==="customer" rows — links this tenant-scoped
  // "membership" row to its global CustomerAccount (identity/password now
  // lives there; name/phone/emailVerified here are denormalized copies kept
  // in sync by customerAccountService.ensureMembership). Always null for
  // business_admin/platform, which have no CustomerAccount and keep
  // authenticating via this row's own password exactly as before.
  customerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerAccount", default: null },
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

module.exports = mongoose.model("User", UserSchema);
