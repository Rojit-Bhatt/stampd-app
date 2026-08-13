const mongoose = require("mongoose");
// Write-only audit ledger for tenant-owned actions: points movement, reward
// fulfillment, customer data edits, and subscription mutations. Platform-
// level platform-admin actions already have their own PlatformAuditLog; this
// one is scoped per business (companyId/organizationId) and intentionally has
// no read endpoint in phase 1 — rows are evidence for the tenant and the
// platform team, surfaced through database inspection only. Read endpoints
// are a phase 2 candidate once the write wiring is proven in production.
//
// Denormalized like PlatformAuditLog (actorName copied at write time): the
// mock DB's .populate() only supports the userId path (see CLAUDE.md), and it
// means the log stays correct if the actor or business is later renamed or
// removed.
const TenantAuditLogSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
  action: {
    type: String,
    enum: [
      "points_earn", "points_redeem", "claim_fulfill", "customer_edit",
      "subscription_change", "stamp_issue"
    ],
    required: true
  },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  actorName: { type: String, default: "" },
  actorRole: { type: String, default: "" },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  // Free-form context: points amounts, reward names, edited fields, plan
  // names, claim IDs — kept as Mixed because each action has a different
  // shape and nothing reads it in phase 1.
  meta: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  // Monotonic ordering key per PlatformAuditLog precedent — two fast actions
  // can share a createdAt millisecond, and the mock DB's sort can't do a
  // secondary tiebreaker.
  sequence: { type: Number, required: true }
});
module.exports = mongoose.model("TenantAuditLog", TenantAuditLogSchema);
