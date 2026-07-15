const mongoose = require("mongoose");

// Bridges "how long a 30s on-screen QR is valid to be *opened*" from "how
// long the customer then has to finish signing in/up". Created the instant
// /:slug/claim loads (converting the still-fresh DynamicQRToken), and is the
// single-use artifact the rest of the flow is keyed on.
const PendingClaimSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  billAmount: { type: Number, default: null },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // The original DynamicQRToken.token (uuid) this was converted from. Kept
  // for audit/idempotency (see pendingClaimService.convertTokenToPendingClaim)
  // — irrelevant to authorization once this row exists.
  sourceToken: { type: String, required: true },
  // null until the customer identifies themselves (login/register/silent
  // global-session entry). Set exactly once.
  customerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerAccount", default: null },
  fulfilled: { type: Boolean, default: false },
  fulfilledAt: { type: Date, default: null },
  // Stores the same `data` payload claimStamp would have returned
  // ({stampsEarned, rewardTriggered, voucherCode?, rewardTitle?}), so
  // GET /api/claim/:id/status can answer polling requests from a tab that
  // isn't authenticated (the "different tab/device" verify-email case).
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Absolute-time TTL: real MongoDB deletes the doc once wall-clock time passes
// the stored expiresAt value. Same caveat as DynamicQRToken's existing TTL
// index: the mock DB used in dev/test never runs TTL at all, so every read
// path below independently re-checks `expiresAt > now` at the application
// level rather than trusting the index alone.
PendingClaimSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PendingClaimSchema.index({ organizationId: 1, sourceToken: 1 });
PendingClaimSchema.index({ customerAccountId: 1, fulfilled: 1 });

module.exports = mongoose.model("PendingClaim", PendingClaimSchema);
