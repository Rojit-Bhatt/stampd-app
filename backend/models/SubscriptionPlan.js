const mongoose = require("mongoose");

// Platform-admin-configurable subscription tier. `slug` is the stable key
// checkout/CTAs reference — never the auto _id — so a plan can be renamed
// without breaking a pending checkout or an already-issued Subscription's
// denormalized `planSlug`.
const SubscriptionPlanSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  // Whole Nepalese Rupees — plain number, never currency-formatted here (see
  // frontend lib/subscription.ts's formatNpr, same convention as
  // Organization.program.minBillAmount).
  priceNpr: { type: Number, required: true, min: 0 },
  businessLimit: { type: Number, required: true, min: 1 },
  features: { type: [String], default: [] },
  isMostPopular: { type: Boolean, default: false },
  billingIntervalDays: { type: Number, default: 365 },
  // Soft-hide instead of delete: an existing Subscription may still reference
  // this plan (by planId and by the denormalized planSlug), so deleting the
  // document out from under it would break history/rendering. isActive:false
  // just removes it from the public pricing page + "pick a plan" checkout.
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

SubscriptionPlanSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);
