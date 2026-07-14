const mongoose = require("mongoose");

const StampClaimEventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

StampClaimEventSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("StampClaimEvent", StampClaimEventSchema);
