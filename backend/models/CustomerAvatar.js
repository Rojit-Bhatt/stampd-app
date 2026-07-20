const mongoose = require("mongoose");

// A customer's profile picture, deliberately in its own collection rather
// than as a field on CustomerAccount. Every CustomerAccount read in the app
// (sign-in, enter-tenant, membership sync, the /explore lists) would
// otherwise drag the image bytes along with it for no reason — this way the
// binary is only ever touched by the one endpoint that serves it.
//
// Stored base64 rather than as a Buffer: the in-memory mock DB used in
// dev/test round-trips plain JSON values, and a string needs no special
// handling from it. The ~33% base64 overhead is charged against an image the
// client has already resized to 256x256 WebP (~10-20KB), so the stored row
// stays well inside any document limit.
const CustomerAvatarSchema = new mongoose.Schema({
  customerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerAccount", required: true },
  mimeType: { type: String, required: true },
  dataBase64: { type: String, required: true },
  byteSize: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now }
});

// One avatar per account. Enforced explicitly in the service too — the mock
// DB doesn't apply indexes (see CustomerAccount for the same note).
CustomerAvatarSchema.index({ customerAccountId: 1 }, { unique: true });

module.exports = mongoose.model("CustomerAvatar", CustomerAvatarSchema);
