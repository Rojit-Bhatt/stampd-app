const mongoose = require("mongoose");

// A manually-issued activation key, replacing live payment-gateway
// integration entirely (see docs/superpowers/plans/
// 2026-07-16-multi-business-subscriptions.md's pivot). The platform admin
// generates one scoped to a plan, confirms payment with the business
// out-of-band (phone/email — outside this app), and hands the code over
// through that same channel. The business admin then redeems it from the
// tenant-scoped Subscription page to activate/extend their owner's
// subscription. Same denormalized-planSlug rationale as Subscription/
// PlatformAuditLog: survives the plan being renamed/archived later.
const SubscriptionKeySchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
  planSlug: { type: String, required: true },
  status: { type: String, enum: ["unused", "redeemed", "revoked"], default: "unused" },
  generatedByActorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // Free-text note the platform admin can jot down — e.g. an invoice
  // reference or which business this was generated for, purely for their
  // own bookkeeping since payment confirmation happens entirely offline.
  note: { type: String, default: "" },
  assignedToOwnerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessOwnerAccount", default: null },
  createdAt: { type: Date, default: Date.now },
  redeemedAt: { type: Date, default: null }
});

SubscriptionKeySchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model("SubscriptionKey", SubscriptionKeySchema);
