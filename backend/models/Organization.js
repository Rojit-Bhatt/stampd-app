const mongoose = require("mongoose");
const { DEFAULT_PROGRAM } = require("../config/platform");

// A tenant. Each business onboarded onto the platform is one Organization.
// All loyalty data (users, stamp cards, vouchers, tokens, menu) is scoped to
// an organizationId so tenants are fully isolated from one another.
const OrganizationSchema = new mongoose.Schema({
  // URL-safe identifier used for path-based tenancy (/<slug>/...) today and
  // subdomain tenancy (<slug>.domain.com) later. Globally unique.
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  status: { type: String, enum: ["active", "suspended"], default: "active" },

  // White-label branding the business admin controls.
  branding: {
    tagline: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    bannerUrl: { type: String, default: "" },
    primaryColor: { type: String, default: "#7c3f1d" }
  },

  // Loyalty program configuration the business admin controls.
  program: {
    stampsRequired: { type: Number, min: 1, default: DEFAULT_PROGRAM.stampsRequired },
    rewardTitle: { type: String, default: DEFAULT_PROGRAM.rewardTitle },
    rewardDescription: { type: String, default: DEFAULT_PROGRAM.rewardDescription },
    cooldownHours: { type: Number, min: 0, default: DEFAULT_PROGRAM.cooldownHours }
  },

  menuEnabled: { type: Boolean, default: false },

  // Reserved for the future subdomain/custom-domain upgrade path.
  customDomain: { type: String, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Organization", OrganizationSchema);
