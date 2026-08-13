const mongoose = require("mongoose");

// A reward that isn't on the menu — a tote bag, a free upgrade, "skip the
// queue". Points-only by definition: it has no rupee price because it is
// never sold.
//
// Deliberately a separate collection from MenuItem rather than a flag on it:
// a menu item is a thing the outlet sells that MAY also be redeemable, and it
// carries a price, category, availability and import identity that a tote bag
// has no business inheriting. The catalog merges the two on read
// (pointsService.getRedeemCatalog); nothing else needs to know there are two.
const RewardItemSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  imageUrl: { type: String, default: "", trim: true },
  // Points at an Image row when the reward's photo was uploaded through
  // FileDrop. Wins over imageUrl on read — see lib/images.ts resolveImageUrl.
  imageId: { type: String, default: null },

  // INTEGER centipoints (utils/pointsMath.js). Required — unlike a MenuItem,
  // a RewardItem with no points price has no reason to exist.
  pointsPriceCenti: { type: Number, required: true, min: 0 },

  // Optional indicative rupee value. Points-only rewards have no inherent
  // price, but owners often want the redeem report's "Value (Rs)" column to
  // carry the reward's approximate worth. Null/absent keeps the column "—".
  valueNpr: { type: Number, default: null },

  // Off = keep the row (and its history) but stop offering it. A redeemed
  // RewardItem is referenced by ledger rows forever, so deleting one would
  // orphan a receipt — PointsTransaction.rewardName is denormalized for
  // exactly that reason, but leaving the row intact is still kinder.
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

RewardItemSchema.index({ organizationId: 1, sortOrder: 1 });

module.exports = mongoose.model("RewardItem", RewardItemSchema);
