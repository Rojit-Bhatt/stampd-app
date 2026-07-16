const mongoose = require("mongoose");

// One per BusinessOwnerAccount. Tracks what plan they're on and gates how
// many businesses (Organizations) they can run — see subscriptionService's
// assertCanAddBusiness. Expiry/grace/reminder are always DERIVED from
// currentPeriodEnd at read time (subscriptionService.computeEffectiveStatus)
// rather than a persisted "expired" status field that needs a cron job to
// flip — the same lazy-expiry approach already used for Voucher.expiresAt,
// necessary because the mock DB (and this app generally) has no scheduler.
const SubscriptionSchema = new mongoose.Schema({
  ownerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessOwnerAccount", required: true },
  // Null while trialing pre-purchase, or for a grandfathered/comped
  // subscription that doesn't reference a real plan document.
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", default: null },
  // Denormalized copy of the plan's slug at purchase time — survives a plan
  // being renamed/archived later, same rationale as PlatformAuditLog's
  // actorName/targetName denormalization. "grandfathered" for the
  // migration-comped case, which references no real plan at all.
  planSlug: { type: String, default: "" },
  status: { type: String, enum: ["trialing", "active", "canceled"], default: "trialing" },
  // Snapshotted from the plan at purchase/renewal time, NOT read live off
  // SubscriptionPlan.businessLimit — so a platform admin editing a plan's
  // limit down later never retroactively strands an existing subscriber
  // mid-cycle (they keep what they paid for until their next renewal).
  businessLimitAtPurchase: { type: Number, required: true },
  currentPeriodStart: { type: Date, default: Date.now },
  currentPeriodEnd: { type: Date, required: true },
  // True for a manually granted/grandfathered subscription (e.g. the
  // pre-existing seeded tenant backfilled by scripts/backfillBusinessOwners.js)
  // — never went through real checkout.
  isComped: { type: Boolean, default: false },
  // Tracks the last time the renewal-reminder email went out, so it fires
  // once per expiry cycle rather than on every page load that happens to
  // read the subscription while within the reminder window (no cron —
  // sent lazily the next time it's read after crossing the threshold, see
  // subscriptionService.maybeSendReminderEmail). Compared against
  // currentPeriodStart so a renewal correctly re-arms it for the new cycle.
  reminderEmailSentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Subscription", SubscriptionSchema);
