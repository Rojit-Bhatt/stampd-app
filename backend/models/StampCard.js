const mongoose = require("mongoose");

const StampCardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  stampsEarned: { type: Number, min: 0, max: 5, default: 0 },
  lastStampedAt: { type: Date, default: null }
});

module.exports = mongoose.model("StampCard", StampCardSchema);
