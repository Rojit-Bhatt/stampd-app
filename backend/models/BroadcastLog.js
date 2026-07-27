const mongoose = require("mongoose");

// One row per (broadcast, customer), ever — written ONLY once a customer
// actually matches the broadcast's segment. The row's mere existence IS the
// idempotency guard: evaluateBroadcasts checks for one before doing
// anything else, and skips immediately if found. A customer who has never
// matched has no row and is simply re-checked on their next earn.
const BroadcastLogSchema = new mongoose.Schema({
  broadcastId: { type: mongoose.Schema.Types.ObjectId, ref: "Broadcast", required: true },
  // Denormalized from the broadcast so isolation-safe queries never need a
  // join — same reasoning as MessageLog.organizationId.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // "no_consent" is a permanent outcome, never retried later even if the
  // customer subsequently grants consent — matches sendTrigger's existing
  // {sent:false, reason:"no_consent"} behavior, which also never retries.
  // "cap_reached" covers BOTH a company with no SMS budget configured at
  // all and one that's exhausted its monthly cap — the admin's actionable
  // response is identical either way ("talk to the platform about your SMS
  // budget"), so these are collapsed into one status rather than a 5th
  // enum member.
  status: { type: String, enum: ["sent", "failed", "no_consent", "cap_reached"], required: true },
  sentAt: { type: Date, default: Date.now }
});

// The mock DB does not enforce this uniqueness — broadcastService MUST
// check-before-write in application code (see evaluateBroadcasts's own
// findOne guard). This index is real-Mongo insurance, not the enforcement
// mechanism itself.
BroadcastLogSchema.index({ broadcastId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("BroadcastLog", BroadcastLogSchema);
