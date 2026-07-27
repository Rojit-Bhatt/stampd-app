const mongoose = require("mongoose");
const { DEFAULT_PROGRAM } = require("../config/platform");

// A company — the top of the ownership tree, registered by the platform
// admin. Owns N outlets (Organizations, see Organization.companyId), each
// with its own slug, branding, program and its own admin credentials.
// Routing is /[company.slug]/[organization.slug]/...
//
// Deliberately holds NO credentials: every staff login (company owners and
// outlet admins alike) lives on AdminAccount, so a single unique index there
// covers the whole staff email namespace — which is what makes the unified
// slug-less admin login unambiguous. Keeping the entity separate from the
// identity also means a company can gain a second owner without reshaping
// anything.
const CompanySchema = new mongoose.Schema({
  // The /[company] URL segment. Globally unique — outlet slugs are unique
  // only WITHIN a company, so this is what disambiguates two chains that
  // each have a "downtown" outlet.
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },

  // Company-level branding, for the company's own surfaces (platform
  // console, company console). Outlets brand themselves independently.
  branding: {
    logoUrl: { type: String, default: "" },
    primaryColor: { type: String, default: "#7c3f1d" }
  },

  // The inheritance root for loyalty config. An outlet's own
  // Organization.program overrides these field-by-field wherever it is
  // non-null — see programService.resolveProgram. Real values live here;
  // Organization.program's fields default to null meaning "inherit".
  programDefaults: {
    earnPercent: { type: Number, min: 0, default: DEFAULT_PROGRAM.earnPercent },
    pointsExpiryDays: { type: Number, min: 0, default: DEFAULT_PROGRAM.pointsExpiryDays }
  },

  // Nullable — null means SMS is not enabled for this company at all (no
  // budget approved yet). A non-null value is the calendar-month spend
  // ceiling in paisa (1 rupee = 100 paisa, same integer-money reasoning
  // pointsMath.js already applies to points, avoiding float drift across
  // many accumulated sends). Set by the platform admin only — see
  // platformService.updateCompany.
  smsMonthlyCapPaisa: { type: Number, min: 0, default: null },

  status: { type: String, enum: ["active", "suspended"], default: "active" },
  createdAt: { type: Date, default: Date.now }
});

// The in-memory mock DB doesn't enforce `unique` indexes (Schema.index is a
// no-op) — uniqueness is enforced by an explicit findOne check in
// companyService, the same pattern customerAccountService already relies on.
CompanySchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("Company", CompanySchema);
