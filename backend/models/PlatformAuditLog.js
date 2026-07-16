const mongoose = require("mongoose");

// Denormalized on purpose: actorName and targetName are copied at write
// time rather than populated from User/Organization, since the mock DB's
// .populate() only supports the userId path (see CLAUDE.md). This also
// means the log still reads correctly even if the actor or business is
// later renamed or removed.
const PlatformAuditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actorName: { type: String, required: true },
  action: {
    type: String,
    enum: [
      "onboard", "edit", "suspend", "reactivate", "invite_admin", "remove_admin",
      "plan_create", "plan_edit", "plan_delete", "assign_plan", "adjust_subscription"
    ],
    required: true
  },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
  targetName: { type: String, required: true },
  details: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  // Authoritative ordering key, separate from createdAt: two actions fired
  // in quick succession (e.g. an automated test, or a fast admin) can land
  // in the same millisecond, and the mock DB's sort only honors a single
  // key anyway (no secondary tiebreaker), so a real monotonic counter is
  // used instead of relying on timestamp precision for "most recent first".
  sequence: { type: Number, required: true }
});

module.exports = mongoose.model("PlatformAuditLog", PlatformAuditLogSchema);
