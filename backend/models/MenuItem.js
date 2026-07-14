const mongoose = require("mongoose");

// Display-only menu item for a tenant. No cart/checkout/pricing logic —
// this is purely a menu the business can choose to show its customers.
const MenuItemSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  // Stored as a display string (e.g. "₹120") so businesses can format freely.
  price: { type: String, default: "", trim: true },
  category: { type: String, default: "General", trim: true },
  isAvailable: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

MenuItemSchema.index({ organizationId: 1, sortOrder: 1 });

module.exports = mongoose.model("MenuItem", MenuItemSchema);
