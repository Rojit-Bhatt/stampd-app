/**
 * One-time migration: attaches a BusinessOwnerAccount to every Organization
 * that predates the multi-business ownership feature (ownerAccountId still
 * null). For each such Organization:
 *
 *   1. Finds its existing business_admin User row.
 *   2. Creates (or reuses, matched by email) a BusinessOwnerAccount for that
 *      admin. No password is set — the grandfathered owner must use
 *      "forgot password" on the owner login page to set one; we have no way
 *      to know their real business_admin password (it's a bcrypt hash).
 *      emailVerified is copied from the admin row (already-verified admins
 *      don't need to re-verify as an owner).
 *   3. Links Organization.ownerAccountId and the admin User's ownerAccountId.
 *   4. Grants a comped, effectively-unlimited Subscription (see D2 in the
 *      plan) so no pre-existing business is ever gated by the new
 *      business-count limit.
 *
 * Idempotent — an Organization that already has ownerAccountId set is left
 * untouched, and re-running finds/reuses the same BusinessOwnerAccount by
 * email rather than creating duplicates.
 *
 * This targets a REAL MongoDB only (via connectDB) — the in-memory mock DB
 * used in dev doesn't need this: server.js's seedDemoData() performs the
 * equivalent linking + comped subscription directly for the seeded
 * Coffesarowar tenant on every fresh boot.
 *
 * Usage:
 *   node backend/scripts/backfillBusinessOwners.js [--dry-run]
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const connectDB = require("../config/db");
const Organization = require("../models/Organization");
const User = require("../models/User");
const BusinessOwnerAccount = require("../models/BusinessOwnerAccount");
const Subscription = require("../models/Subscription");

const HUNDRED_YEARS_MS = 100 * 365 * 24 * 60 * 60 * 1000;

async function backfillBusinessOwners() {
  const dryRun = process.argv.includes("--dry-run");

  await connectDB();

  const orgsWithoutOwner = await Organization.find({ ownerAccountId: null });

  if (orgsWithoutOwner.length === 0) {
    console.log("Nothing to migrate — every Organization already has an ownerAccountId.");
    await mongoose.connection.close();
    return;
  }

  console.log(`Found ${orgsWithoutOwner.length} Organization(s) without an owner.`);

  let migrated = 0;
  for (const org of orgsWithoutOwner) {
    const admin = await User.findOne({ organizationId: org._id, role: "business_admin" });
    if (!admin) {
      console.warn(`  Skipping "${org.name}" (${org._id}) — no business_admin row found.`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] "${org.name}" -> owner account for ${admin.email} (comped, unlimited)`);
      continue;
    }

    let owner = await BusinessOwnerAccount.findOne({ email: admin.email });
    if (!owner) {
      owner = await BusinessOwnerAccount.create({
        name: admin.name,
        email: admin.email,
        phone: admin.phone || "",
        emailVerified: admin.emailVerified,
        password: null
      });
    }

    await Organization.updateOne({ _id: org._id }, { $set: { ownerAccountId: owner._id } });
    await User.updateOne({ _id: admin._id }, { $set: { ownerAccountId: owner._id } });

    const existingSub = await Subscription.findOne({ ownerAccountId: owner._id });
    if (!existingSub) {
      const now = new Date();
      await Subscription.create({
        ownerAccountId: owner._id,
        planId: null,
        planSlug: "grandfathered",
        status: "active",
        businessLimitAtPurchase: Math.max(10, orgsWithoutOwner.length),
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + HUNDRED_YEARS_MS),
        isComped: true
      });
    }

    migrated += 1;
  }

  if (dryRun) {
    console.log(`[dry-run] Would migrate ${orgsWithoutOwner.length} organization(s). No changes made.`);
  } else {
    console.log(`Migrated ${migrated} organization(s) to the new ownership model.`);
  }

  await mongoose.connection.close();
}

backfillBusinessOwners().catch((err) => {
  console.error("Migration failed:", err);
  mongoose.connection.close();
  process.exit(1);
});
