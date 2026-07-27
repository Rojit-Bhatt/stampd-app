const mongoose = require("mongoose");
const { TIER_LABELS } = require("../config/platform");

// An ongoing messaging rule, not a one-off blast: the admin sets a segment
// and a message once, and evaluateBroadcasts (services/broadcastService.js)
// sends it automatically the moment a customer is first observed to match —
// no send button, no scheduledAt. segmentTier is required only when
// segmentType is "tier"; "all" ignores it (kept null).
const BroadcastSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  channel: { type: String, enum: ["email", "push", "sms"], required: true },
  segmentType: { type: String, enum: ["tier", "all"], required: true },
  segmentTier: { type: String, enum: TIER_LABELS, default: null },
  subject: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  // Pausing stops all future evaluation (no new BroadcastLog rows) without
  // deleting history; reactivating does not retroactively catch up on
  // matches that would have fired while paused (evaluation only happens at
  // the moment of an earn).
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

BroadcastSchema.index({ organizationId: 1, active: 1 });

module.exports = mongoose.model("Broadcast", BroadcastSchema);
