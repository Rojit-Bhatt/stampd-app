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
  minBillAmount: 0
};

module.exports = {
  PLATFORM_NAME,
  DEFAULT_PROGRAM
};
