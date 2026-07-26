const mongoose = require("mongoose");

// One row per successful trigger send — append-only, never edited. This is
// what makes triggers idempotent: the birthday cron checks for an existing
// row this calendar year before sending, and the inactivity cron checks for
// one within the configured cooldown window before re-nudging.
const MessageLogSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  triggerType: { type: String, enum: ["milestone", "birthday", "inactivity"], required: true },
  sentAt: { type: Date, default: Date.now }
});

MessageLogSchema.index({ organizationId: 1, userId: 1, triggerType: 1, sentAt: -1 });

module.exports = mongoose.model("MessageLog", MessageLogSchema);
