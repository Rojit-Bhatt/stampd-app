const mongoose = require("mongoose");

// One row per notification-worthy event at an outlet — append-only, like
// PointsTransaction/MessageLog. Two event types today (see
// notificationService.js): a redemption, and a customer's first-ever
// arrival at THIS outlet. Deliberately excludes routine earns, which
// happen dozens of times a shift and would flood this into noise.
const NotificationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  type: { type: String, enum: ["redemption", "new_customer"], required: true },
  message: { type: String, required: true },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

NotificationSchema.index({ organizationId: 1, createdAt: -1 });
NotificationSchema.index({ organizationId: 1, readAt: 1 });

module.exports = mongoose.model("Notification", NotificationSchema);
