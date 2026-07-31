const Image = require("../models/Image");
const { sniffImageType } = require("../utils/imageBytes");

// 512KB. A 800px WebP banner lands far under this, so anything above it is a
// client bug or an attack, not a legitimate photo.
const MAX_IMAGE_BYTES = 512 * 1024;

const OWNER_TYPES = ["branding_logo", "branding_banner", "reward", "event"];

// An upload that is never claimed by a save is an abandoned upload: the admin
// picked a file and then cancelled the modal. Swept opportunistically on the
// next upload from the same outlet rather than by a cron — there is no cron
// anywhere in this codebase and none is being added. Scoped to the uploading
// outlet, so it can never touch another tenant's rows.
const ABANDONED_MS = 24 * 60 * 60 * 1000;

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sweepAbandoned = async (organizationId) => {
  await Image.deleteMany({
    organizationId,
    ownerId: null,
    createdAt: { $lte: new Date(Date.now() - ABANDONED_MS) }
  });
};

const createImage = async ({ organizationId, ownerType, buffer }) => {
  if (!organizationId) throw createHttpError("An outlet is required.", 400);
  if (!OWNER_TYPES.includes(ownerType)) {
    throw createHttpError("Unknown image type.", 400);
  }
  if (!buffer || !buffer.length) throw createHttpError("An image file is required.", 400);
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw createHttpError("That image is too large — pick one under 512KB.", 400);
  }
  const mimeType = sniffImageType(buffer);
  if (!mimeType) {
    throw createHttpError("Images must be a WebP, JPEG, or PNG file.", 400);
  }

  await sweepAbandoned(organizationId);

  const row = await Image.create({
    organizationId,
    ownerType,
    ownerId: null,
    mimeType,
    dataBase64: buffer.toString("base64"),
    byteSize: buffer.length,
    createdAt: new Date()
  });

  return { id: row._id.toString(), mimeType, byteSize: buffer.length };
};

// Unscoped on purpose — the read endpoint is public and has no tenant
// context. See the controller for why that is safe here.
const getImage = async (id) => {
  const row = await Image.findOne({ _id: id });
  if (!row) return null;
  return {
    mimeType: row.mimeType,
    buffer: Buffer.from(row.dataBase64, "base64"),
    byteSize: row.byteSize
  };
};

// Scoped: an outlet can only claim an image it uploaded.
const claimImage = async ({ id, organizationId, ownerId }) => {
  if (!id) return false;
  const row = await Image.findOne({ _id: id, organizationId });
  if (!row) return false;
  row.ownerId = String(ownerId);
  await row.save();
  return true;
};

// Scoped: an outlet can only delete its own images. This is what stops one
// tenant's admin deleting another tenant's reward photo by guessing an id.
const deleteImage = async ({ id, organizationId }) => {
  if (!id) return false;
  const row = await Image.findOne({ _id: id, organizationId });
  if (!row) return false;
  await Image.deleteOne({ _id: row._id });
  return true;
};

module.exports = {
  MAX_IMAGE_BYTES,
  OWNER_TYPES,
  createImage,
  getImage,
  claimImage,
  deleteImage
};
