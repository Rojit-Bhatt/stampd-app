const mongoose = require("mongoose");

// One row per browser/device — a customer can have several. Endpoint is
// unique: the same device re-subscribing (e.g. after clearing storage)
// updates its existing row instead of accumulating duplicates.
const PushSubscriptionSchema = new mongoose.Schema({
  customerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerAccount", required: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  createdAt: { type: Date, default: Date.now }
});

PushSubscriptionSchema.index({ customerAccountId: 1 });
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.model("PushSubscription", PushSubscriptionSchema);
