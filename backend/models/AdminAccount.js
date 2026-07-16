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

  // company_owner -> manages the company, its outlets and its subscription;
  //                  organizationId is null (owns all of them, not one).
  // outlet_admin   -> runs exactly one outlet's console; organizationId set.
  kind: { type: String, enum: ["company_owner", "outlet_admin"], required: true },

  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  // Null for a company_owner. Set for an outlet_admin — the one outlet it
  // administers.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },

  createdAt: { type: Date, default: Date.now }
});

// The whole staff email namespace, in one enforceable index.
AdminAccountSchema.index({ email: 1 }, { unique: true });
AdminAccountSchema.index({ companyId: 1, kind: 1 });
// One admin account per outlet. Partial rather than sparse — company_owner
// rows carry organizationId present-but-null, which sparse would NOT
// exclude, so they'd all collide on null (same reasoning as User's
// customerAccountId index).
AdminAccountSchema.index(
  { organizationId: 1 },
  { unique: true, partialFilterExpression: { organizationId: { $type: "objectId" } } }
);

module.exports = mongoose.model("AdminAccount", AdminAccountSchema);
