const mongoose = require("mongoose");

const DynamicQRTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  isUsed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

DynamicQRTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 });

module.exports = mongoose.model("DynamicQRToken", DynamicQRTokenSchema);
