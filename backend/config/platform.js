// Central place for platform-wide branding + defaults.
// Change PLATFORM_NAME here (or via env) to rebrand the whole SaaS.
const PLATFORM_NAME = process.env.PLATFORM_NAME || "Stampd";

// Default loyalty program configuration applied to a brand-new tenant.
// A company overrides these for all its outlets (Company.programDefaults);
// an outlet overrides its company field-by-field (Organization.program).
// programService.resolveProgram is the only place the three are collapsed.
//
// This object's KEYS are the schema: programService derives PROGRAM_FIELDS
// from them, so adding a program field means adding it here first.
const DEFAULT_PROGRAM = {
  // Percentage of the bill returned as points. 100 = 1 point per rupee.
  // Below 100 is where fractional points come from: 10% of a Rs 105 bill is
  // 10.5 points, which is exactly why points are stored as centipoints
  // (see utils/pointsMath.js).
  earnPercent: 100,
  // 0 = points never expire. Above 0, a balance expires this many days after
  // the customer's LAST activity — rolling inactivity, not a fixed date, so
  // any earn or redeem restarts the clock. Derived lazily at read time; no
  // cron job exists anywhere in this codebase.
  pointsExpiryDays: 0
};

// The fixed set of business categories a tenant can be filed under, used for
// the customer-facing /explore directory's filter pills. "other" is the safe
// default for a business that hasn't set one.
const BUSINESS_CATEGORIES = ["cafe", "restaurant", "bakery", "salon", "gym", "retail", "other"];

// The timezone a campaign's day-of-week is judged in. The server runs UTC,
// and Nepal is UTC+5:45 — so a campaign set to "Thursdays" would otherwise
// start and end 5h45m off, which a business would notice immediately. Only
// daysOfWeek needs this: startAt/endAt are absolute instants and are correct
// in UTC already.
//
// One timezone for the whole platform, not per-outlet, because the platform
// is Nepal-only. If that ever changes, this moves onto Company.
const PLATFORM_TIMEZONE = process.env.PLATFORM_TIMEZONE || "Asia/Kathmandu";

// How overlapping campaign multipliers combine. "max" takes the single best
// multiplier; "compound" would multiply them together.
//
// max, deliberately: compounding is how a 2x weekend plus a 3x holiday
// silently becomes 6x and gives away far more than either campaign promised.
// A business can always express "6x" by writing 6.
const CAMPAIGN_STACKING = "max";

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
  "admin-verify-email", "admin-forgot-password", "admin-reset-password",
  "verify-email", "reset-password", "forgot-password"
]);

const isReservedSlug = (slug) => RESERVED_SLUGS.has(String(slug || "").trim().toLowerCase());

module.exports = {
  PLATFORM_NAME,
  PLATFORM_TIMEZONE,
  CAMPAIGN_STACKING,
  DEFAULT_PROGRAM,
  BUSINESS_CATEGORIES,
  RESERVED_SLUGS,
  isReservedSlug
};
