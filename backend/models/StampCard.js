const mongoose = require("mongoose");

const StampCardSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  // No upper bound here: the reward threshold (stampsRequired) is configured
  // per tenant on the Organization, so the card resets based on that value.
  stampsEarned: { type: Number, min: 0, default: 0 },
  lastStampedAt: { type: Date, default: null }
});

StampCardSchema.index({ organizationId: 1, userId: 1 });

module.exports = mongoose.model("StampCard", StampCardSchema);
