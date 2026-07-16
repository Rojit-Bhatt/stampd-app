const mongoose = require("mongoose");

// The single global identity for a business owner, shared across every
// business (Organization) they run. Direct analogue of CustomerAccount —
// owns email/password/phone/name/emailVerified/googleId. Each Organization
// this owner controls keeps its own tenant-scoped business_admin User
// "membership" row — see User.ownerAccountId and Organization.ownerAccountId.
const BusinessOwnerAccountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  googleId: { type: String, default: null },
  password: { type: String, required: false },
  phone: { type: String, trim: true, default: "" },
  emailVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// The in-memory mock DB used in dev/test doesn't enforce `unique` indexes —
// global-uniqueness is enforced by an explicit findOne check in
// ownerAccountService, same pattern customerAccountService already relies on.
BusinessOwnerAccountSchema.index({ email: 1 }, { unique: true });
BusinessOwnerAccountSchema.index({ googleId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("BusinessOwnerAccount", BusinessOwnerAccountSchema);
