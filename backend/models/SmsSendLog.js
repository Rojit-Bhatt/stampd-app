const mongoose = require("mongoose");

// Company-scoped (not outlet-scoped): a company's SMS budget covers every
// one of its outlets combined, and both sending paths (canned triggers,
// Broadcast) share this one log — see design Decision 4. Current-month
// spend is SUMMED from this at read time, never a stored running counter
// (same reasoning Subscription.currentPeriodEnd's expiry is always derived
// at read time rather than a scheduled reset).
const SmsSendLogSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  sentAt: { type: Date, default: Date.now },
  // Snapshotted from SMS_COST_PAISA_PER_MESSAGE at send time, so a later
  // price change doesn't retroactively rewrite this month's already-logged
  // spend — same snapshotting reasoning Campaign's multiplier/campaignId
  // already applies to the points ledger.
  costPaisa: { type: Number, required: true, min: 0 }
});

SmsSendLogSchema.index({ companyId: 1, sentAt: -1 });

module.exports = mongoose.model("SmsSendLog", SmsSendLogSchema);
