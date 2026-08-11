const mongoose = require("mongoose");

// A tenant's upcoming/past event listing. Display-only, same tenant-scoped
// pattern as MenuItem — no RSVP/ticketing, just a display for customers.
const EventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  title: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  // Display string only (e.g. "7:00 PM") — no timezone logic.
  time: { type: String, default: "", trim: true },
  location: { type: String, default: "", trim: true },
  description: { type: String, default: "", trim: true },
  imageUrl: { type: String, default: "", trim: true },
  // Points at an Image row when the event's photo was uploaded through
  // FileDrop. Wins over imageUrl on read — see lib/images.ts resolveImageUrl.
  imageId: { type: String, default: null },
  // Vertical anchor (0-100) for the letterboxed poster image, so an admin
  // can nudge which part of a tall/short photo sits in frame.
  imagePositionY: { type: Number, default: 50, min: 0, max: 100 },
  // Optional structured prize list — e.g. [{ rank: "1st Place", reward: "NPR 5,000 + Trophy" }].
  // Empty array means "no rewards for this event" (a dance night has none).
  rewards: {
    type: [{
      rank: { type: String, required: true, trim: true },
      reward: { type: String, required: true, trim: true }
    }],
    default: []
  },
  createdAt: { type: Date, default: Date.now }
});

EventSchema.index({ organizationId: 1, date: 1 });

module.exports = mongoose.model("Event", EventSchema);
