/**
 * One-time migration: MenuItem.price changed from a free-form display
 * string (e.g. "₹150") to a Number. Existing rows still hold the old
 * string in the raw collection until this runs — Mongoose only applies the
 * new schema type on future writes, not retroactively.
 *
 * Strips any non-digit/non-dot characters and parses the remainder. Rows
 * with no parseable number (blank, or text with no digits) are set to null.
 *
 * Idempotent — rows already holding a numeric price are left untouched.
 *
 * Usage:
 *   node backend/scripts/migrateMenuItemPriceToNumber.js [--dry-run]
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const connectDB = require("../config/db");
const MenuItem = require("../models/MenuItem");

const parsePrice = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

async function migrateMenuItemPriceToNumber() {
  const dryRun = process.argv.includes("--dry-run");

  await connectDB();

  const items = await MenuItem.find({});
  const toMigrate = items.filter((item) => typeof item.price === "string");

  if (toMigrate.length === 0) {
    console.log("Nothing to migrate — no string-typed price fields found.");
    await mongoose.connection.close();
    return;
  }

  console.log(`Found ${toMigrate.length} menu item(s) with a string price.`);

  let migrated = 0;
  for (const item of toMigrate) {
    const numericPrice = parsePrice(item.price);

    if (dryRun) {
      console.log(`[dry-run] ${item._id} "${item.name}": "${item.price}" -> ${numericPrice}`);
      continue;
    }

    await MenuItem.updateOne({ _id: item._id }, { $set: { price: numericPrice } });
    migrated += 1;
  }

  if (dryRun) {
    console.log(`[dry-run] Would migrate ${toMigrate.length} row(s). No changes made.`);
  } else {
    console.log(`Migrated ${migrated} menu item(s) to numeric price.`);
  }

  await mongoose.connection.close();
}

migrateMenuItemPriceToNumber().catch((err) => {
  console.error("Migration failed:", err);
  mongoose.connection.close();
  process.exit(1);
});
