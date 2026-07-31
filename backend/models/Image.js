const mongoose = require("mongoose");

// An uploaded picture — an outlet logo, a banner, a reward photo, an event
// photo — deliberately in its own collection rather than as a base64 field on
// the document that uses it.
//
// resolveTenant fetches the Organization document on EVERY public request
// (tenant lookup, menu load, claim page). A base64 logo stored on that
// document rides along on all of them. Here the bytes are only ever touched
// by the one endpoint that serves them, and that response is cached
// immutably.
//
// Stored base64 rather than as a Buffer, matching CustomerAvatar: the
// in-memory mock DB used in dev/test round-trips plain JSON values, and a
// string needs no special handling from it. The ~33% overhead is charged
// against an image the client has already resized and WebP-encoded.
//
// Rows are never updated in place. Replacing an image writes a new row and
// deletes the old one, which is what makes `immutable` caching safe without
// a version query parameter — an id always means the same bytes.
const ImageSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  ownerType: { type: String, required: true },
  // Null until the form that uploaded this image is actually saved. An
  // unclaimed row is an abandoned upload — see the sweep in imageService.
  ownerId: { type: String, default: null },
  mimeType: { type: String, required: true },
  dataBase64: { type: String, required: true },
  byteSize: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Image", ImageSchema);
