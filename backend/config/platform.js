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

// Slugs a company may never take. A company slug owns a whole top-level URL
// segment (/[company]/[outlet]), so one colliding with a static route would
// make that company permanently unreachable — React Router ranks static
// above dynamic, so the app keeps working and the company silently doesn't.
// Must cover every top-level route in the frontend's App.tsx plus the API
// prefix and the reserved subdomains.
const RESERVED_SLUGS = new Set([
  "api", "www", "app", "admin", "assets", "static", "public",
  "explore", "platform", "company", "owner",
  "admin-login", "business-login", "customer-login", "customer-register",
  "verify-email", "reset-password", "forgot-password"
]);

const isReservedSlug = (slug) => RESERVED_SLUGS.has(String(slug || "").trim().toLowerCase());

module.exports = {
  PLATFORM_NAME,
  DEFAULT_PROGRAM,
  BUSINESS_CATEGORIES,
  RESERVED_SLUGS,
  isReservedSlug
};
