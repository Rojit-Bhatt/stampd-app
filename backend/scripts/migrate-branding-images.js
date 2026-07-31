/**
 * Moves branding images that were stored as inline base64 data URIs into
 * Image rows, one row per outlet slot.
 *
 * Safe to run more than once: an outlet that already has an imageId for a
 * slot is skipped, so a re-run is a no-op rather than a duplicate.
 *
 * Run against a real database with:
 *   MONGODB_URI="<uri>" node scripts/migrate-branding-images.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const { createImage, claimImage } = require("../services/imageService");

const DATA_URI = /^data:(image\/[a-z+]+);base64,(.+)$/i;

const migrateSlot = async (org, urlField, idField, ownerType) => {
  if (org.branding?.[idField]) return false;
  const value = org.branding?.[urlField];
  const match = typeof value === "string" && value.match(DATA_URI);
  if (!match) return false;

  const buffer = Buffer.from(match[2], "base64");
  const { id } = await createImage({
    organizationId: org._id,
    ownerType,
    buffer
  });
  await claimImage({ id, organizationId: org._id, ownerId: org._id });
  org.branding[idField] = id;
  return true;
};

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required — this script is for real databases only.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const orgs = await Organization.find({});
  let moved = 0;
  for (const org of orgs) {
    const a = await migrateSlot(org, "logoUrl", "logoImageId", "branding_logo");
    const b = await migrateSlot(org, "bannerUrl", "bannerImageId", "branding_banner");
    if (a || b) {
      await org.save();
      moved++;
      console.log(`migrated ${org.slug}${a ? " logo" : ""}${b ? " banner" : ""}`);
    }
  }
  console.log(`\nDone. ${moved} outlet(s) updated of ${orgs.length}.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
