// Central place for platform-wide branding + defaults.
// Change PLATFORM_NAME here (or via env) to rebrand the whole SaaS.
const PLATFORM_NAME = process.env.PLATFORM_NAME || "Stampd";

// Default loyalty program configuration applied to a brand-new tenant.
// Individual businesses can override these from their admin console.
const DEFAULT_PROGRAM = {
  stampsRequired: 5,
  rewardTitle: "Free Coffee",
  rewardDescription: "Collect stamps on every visit and unlock a free coffee.",
  cooldownHours: 18,
  minBillAmount: 0,
  // 0 = vouchers never expire. When set above 0, a voucher earned under
  // this program gets an expiresAt of (earnedAt + this many days).
  voucherExpiryDays: 0
};

// The fixed set of business categories a tenant can be filed under, used for
// the customer-facing /explore directory's filter pills. "other" is the safe
// default for a business that hasn't set one.
const BUSINESS_CATEGORIES = ["cafe", "restaurant", "bakery", "salon", "gym", "retail", "other"];

module.exports = {
  PLATFORM_NAME,
  DEFAULT_PROGRAM,
  BUSINESS_CATEGORIES
};
