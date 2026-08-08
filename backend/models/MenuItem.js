const mongoose = require("mongoose");

// A menu item for a tenant. No cart or checkout — the menu is display-only
// for browsing, with one exception: an item carrying a pointsPrice is also
// redeemable against a points balance.
const MenuItemSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  price: { type: Number, default: null, min: 0 },

  // Optional reward photo, shown in the redeem catalog when the item is
  // redeemable. Same shape as RewardItem: imageId points at an Image row
  // (uploaded via FileDrop) and wins over imageUrl — see resolveImageUrl.
  imageUrl: { type: String, default: "", trim: true },
  imageId: { type: String, default: null },

  // What this item costs in INTEGER centipoints (utils/pointsMath.js).
  // null = menu-only, not redeemable — the default, so adding points to an
  // outlet never silently puts its whole menu up for redemption.
  pointsPriceCenti: { type: Number, default: null, min: 0 },
  category: { type: String, default: "General", trim: true },
  isAvailable: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

MenuItemSchema.index({ organizationId: 1, sortOrder: 1 });

module.exports = mongoose.model("MenuItem", MenuItemSchema);
