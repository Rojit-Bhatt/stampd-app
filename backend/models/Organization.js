const mongoose = require("mongoose");
const { BUSINESS_CATEGORIES } = require("../config/platform");

// A tenant — one outlet (cafe/branch) belonging to a Company. All loyalty
// data (users, cards, vouchers, tokens, menu) is scoped to an
// organizationId so outlets are fully isolated from one another, including
// outlets of the SAME company: they share an owner and nothing else.
const OrganizationSchema = new mongoose.Schema({
  // The company this outlet belongs to. Every outlet has one — the platform
  // registers companies, and companies register their own outlets.
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  // The /[outlet] URL segment, second of two: /[company.slug]/[this].
  // Unique only WITHIN its company (see the compound index below), so two
  // different chains can each have a "downtown" outlet.
  slug: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  // archived = soft-deleted by its company owner: stops serving customers
  // and frees a subscription slot, but every customer/point/transaction row
  // stays intact for reporting. Reversible; never cascades a delete.
  status: { type: String, enum: ["active", "suspended", "archived"], default: "active" },
  // Powers the customer-facing /explore directory's filter pills.
  category: { type: String, enum: BUSINESS_CATEGORIES, default: "other" },

  // White-label branding the business admin controls.
  branding: {
    tagline: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    bannerUrl: { type: String, default: "" },
    primaryColor: { type: String, default: "#7c3f1d" }
  },

  // This outlet's loyalty overrides. EVERY field defaults to null meaning
  // "inherit from Company.programDefaults" — resolved by
  // programService.resolveProgram, which is the only place config is read.
  //
  // The nulls are load-bearing: the mock DB fills nested schema defaults
  // (mockMongoose computeDefaults), so a non-null default here would make
  // every field always-populated and inheritance could never fire — there'd
  // be no way to tell "unset" from "explicitly set to the default value".
  // Resolution must use `??`, never `||`: 0 is a legitimate value for
  // minBillAmount/voucherExpiryDays and must not fall through to the parent.
  program: {
    stampsRequired: { type: Number, min: 1, default: null },
    rewardTitle: { type: String, default: null },
    rewardDescription: { type: String, default: null },
    cooldownHours: { type: Number, min: 0, default: null },
    minBillAmount: { type: Number, min: 0, default: null },
    voucherExpiryDays: { type: Number, min: 0, default: null }
  },

  // Contact/location/social info the business admin controls, shown to
  // customers on their dashboard. All fields optional — a tenant with
  // nothing filled in just shows no contact section.
  contact: {
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    hours: { type: String, default: "" },
    aboutUs: { type: String, default: "" },
    socials: {
      instagram: { type: String, default: "" },
      facebook: { type: String, default: "" },
      x: { type: String, default: "" }
    }
  },

  menuEnabled: { type: Boolean, default: false },

  // Reserved for the future subdomain/custom-domain upgrade path.
  customDomain: { type: String, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now }
});

// Outlet slugs are unique per company, NOT globally — /acme/downtown and
// /bros/downtown are two different outlets. This is why tenant resolution
// (middleware/tenantMiddleware.js) must key on company + outlet together
// and can never look an outlet up by slug alone.
OrganizationSchema.index({ companyId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model("Organization", OrganizationSchema);
