// Central place for subscription/billing defaults. The actual SubscriptionPlan
// documents are platform-admin-configurable (see models/SubscriptionPlan.js) —
// DEFAULT_PLANS here is only the one-time seed data, not a source of truth
// read at runtime.
const DEFAULT_PLANS = [
  {
    slug: "basic",
    name: "Basic",
    priceNpr: 999,
    outletLimit: 1,
    features: [
      "1 outlet",
      "Points loyalty program",
      "AI Digital Menu",
      "Scratch Cards",
      "Unlimited QR scans",
      "Analytics dashboard",
      "FREE QR code stand"
    ],
    isMostPopular: false,
    sortOrder: 0
  },
  {
    slug: "growth",
    name: "Growth",
    priceNpr: 2499,
    outletLimit: 3,
    features: [
      "Up to 3 outlets",
      "Points loyalty program",
      "AI Digital Menu",
      "Scratch Cards",
      "Same QR, GPS branch detection",
      "Branch-wise scan analytics",
      "Priority support"
    ],
    isMostPopular: true,
    sortOrder: 1
  },
  {
    slug: "pro",
    name: "Pro",
    priceNpr: 4999,
    outletLimit: 6,
    features: [
      "Up to 6 outlets",
      "Points loyalty program",
      "AI Digital Menu",
      "Scratch Cards",
      "Same QR, GPS branch detection",
      "Branch-wise scan analytics",
      "Dedicated account manager"
    ],
    isMostPopular: false,
    sortOrder: 2
  }
];

// A brand-new self-serve owner gets this many days running exactly one
// business before they must pick a paid plan (see D3 — no separate Rs 0 plan).
const TRIAL_DAYS = 14;

// The in-app (and email) renewal reminder appears once currentPeriodEnd is
// this many days away or closer.
const EXPIRY_REMINDER_DAYS = 7;

// After currentPeriodEnd passes, an owner keeps full owner-tier access (can
// still add businesses up to their limit) for this many extra days before
// actually being gated — absorbs the "manual renewal, no auto-charge" lag.
const GRACE_PERIOD_DAYS = 5;

// Every plan bills for one year at a time (manual redirect-checkout renewal,
// no recurring/auto-charge API on either gateway).
const BILLING_INTERVAL_DAYS = 365;

const PAYMENT_GATEWAYS = ["esewa", "fonepay"];

module.exports = {
  DEFAULT_PLANS,
  TRIAL_DAYS,
  EXPIRY_REMINDER_DAYS,
  GRACE_PERIOD_DAYS,
  BILLING_INTERVAL_DAYS,
  PAYMENT_GATEWAYS
};
