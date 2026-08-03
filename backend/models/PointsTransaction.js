const mongoose = require("mongoose");

// The append-only ledger of every points movement at an outlet. Replaces the
// old StampClaimEvent, and is the single source for the customer's points
// history, the admin's transaction history, and every points/revenue report.
//
// Never updated or deleted after write. A correction is a new row, not an
// edit — the balance must always equal the sum of this ledger, which is what
// makes a drifted balance detectable instead of merely wrong.
const PointsTransactionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  type: { type: String, enum: ["earn", "redeem", "expire"], required: true },

  // SIGNED integer centipoints: positive for earn, negative for redeem and
  // expire. Signed rather than magnitude+type so a balance check is a plain
  // sum with no per-type branching — and so a new type can't silently be
  // summed the wrong way.
  pointsCenti: { type: Number, required: true },

  // Balance immediately after this row was applied. Denormalized so the
  // customer's history can show a running total without replaying the whole
  // ledger on every read (the mock DB has no aggregation pipeline).
  balanceAfterCenti: { type: Number, default: 0 },

  // --- earn only ---
  // The bill the customer actually paid, in rupees. Stored, never $inc-ed,
  // so a float is safe here (unlike the balance). This is the source for
  // every revenue figure in the app.
  billAmount: { type: Number, default: null },
  // The rate this row was earned at, snapshotted. Read from the ledger, never
  // recomputed off the live program: an admin lowering earnPercent next month
  // must not rewrite what last month's receipts say they earned.
  earnPercent: { type: Number, default: null },
  // Campaign multiplier applied (Phase C). 1 = no campaign.
  multiplier: { type: Number, default: 1 },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  // Denormalized on purpose, same as rewardName below: a campaign can be
  // renamed or deleted later, and the ledger row has to keep saying why it
  // was worth what it was even after campaignId points at nothing.
  campaignName: { type: String, default: "" },

  // --- redeem only ---
  // Which collection rewardRef points into. A ref alone is ambiguous now that
  // a redemption can be a MenuItem or a standalone RewardItem.
  rewardKind: { type: String, enum: ["menu", "reward", null], default: null },
  rewardRef: { type: mongoose.Schema.Types.ObjectId, default: null },
  // Denormalized on purpose: the item can be renamed or deleted from the menu
  // later, and a receipt must still say what was actually handed over.
  rewardName: { type: String, default: "" },

  // The QR token this movement came from, for audit. Null for expire, which
  // no one initiates.
  token: { type: String, default: null },

  // Which staff member was at the counter. Null for every row written before
  // this existed and for every outlet that hasn't turned PINs on — an absent
  // attribution is a real state, not a defect. Never set on `expire` rows:
  // no one initiates those.
  performedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // Denormalized for the same reason rewardName and campaignName above are:
  // the membership can be deleted, and the ledger has to keep saying who did
  // this after the row it names is gone.
  performedByName: { type: String, default: "" },

  createdAt: { type: Date, default: Date.now }
});

// Every read is "this outlet's ledger, newest first" — either for one
// customer or for the whole outlet.
PointsTransactionSchema.index({ organizationId: 1, createdAt: -1 });
PointsTransactionSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model("PointsTransaction", PointsTransactionSchema);
