// Frontend mirror of backend/config/subscription.js's fixed knobs (plans
// themselves are fetched from the API — this is just display/formatting
// constants, not a source of truth).
export const TRIAL_DAYS = 14;
export const EXPIRY_REMINDER_DAYS = 7;
export const GRACE_PERIOD_DAYS = 5;

// Nepal uses the Nepalese Rupee (NPR), conventionally written "Rs" — not the
// "₹" glyph, which is the Indian Rupee sign. Amounts are stored as plain
// whole-number NPR (see SubscriptionPlan.priceNpr) and only ever formatted
// here, so there's a single place to change if that convention ever changes.
export function formatNpr(amount: number): string {
  return `Rs ${amount.toLocaleString("en-IN")}`;
}
