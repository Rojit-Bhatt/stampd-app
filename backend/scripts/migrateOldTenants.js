/**
 * One-time production migration: make OLD pre-restructure tenant rows
 * reachable under the new company/outlet tenancy.
 *
 * BACKGROUND
 * ----------
 * The old schema stored each tenant as a single `Organization` row whose
 * `slug` was GLOBALLY unique (URL path /<slug>/...). There was no Company
 * layer at all. The company/outlet restructure (Jul 2026) added the Company
 * model, made every Organization require a `companyId`, and changed slug
 * resolution to the /[company.slug]/[outlet.slug] pair. Old rows were never
 * migrated, so on the live database they became invisible: every route that
 * resolves a tenant now fails with "Company '<slug>' was not found".
 *
 * WHAT THIS DOES
 * --------------
 * For each `Organization` row whose `companyId` is missing (or points at a
 * non-existent Company):
 *   1. Derive a unique company slug from the org's name (e.g. "Stampee Cafe"
 *      -> "stampee-cafe").
 *   2. Create a `Company` row carrying the org's name, category, branding
 *      and contact (the org becomes the company's first outlet).
 *   3. Set the org's `companyId` and status to `active`.
 *
 * The org's own slug is UNCHANGED, so old customer bookmarks
 * (stampdd.club/<old-slug>/...) keep resolving — the frontend translates
 * the single-segment path into the two header slugs the API expects.
 *
 * Idempotent: rows that already have a valid companyId are skipped.
 * Dry-run mode (`--dry-run`) reports what would change without writing.
 *
 * Usage (from the repo root on Render, after this commit is deployed):
 *   node backend/scripts/migrateOldTenants.js --dry-run
 *   node backend/scripts/migrateOldTenants.js
 *
 * NOTE: runs against the REAL database (backend/.env), not the mock DB.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const slugify = (raw) => {
  const base = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "untitled";
  return base;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await connectDB();

  const Organization = require("../models/Organization");
  const Company = require("../models/Company");

  // Old rows: no companyId, or companyId dangling on a deleted Company.
  const orgs = await Organization.find({});
  const candidates = [];
  for (const org of orgs) {
    if (org.companyId) {
      const company = await Company.findById(org.companyId).lean();
      if (company) continue; // already linked to a live company
    }
    candidates.push(org);
  }

  console.log(
    `Mode: ${dryRun ? "DRY RUN" : "APPLY"} — ` +
    `${candidates.length} of ${orgs.length} outlet row(s) need migration.`
  );

  let created = 0;
  for (const org of candidates) {
    // Company slug derived from the outlet's own name.
    let companySlug = slugify(org.name);
    const existing = await Company.findOne({ slug: companySlug }).lean();
    if (existing) {
      // Avoid collisions: append a counter suffix.
      let n = 2;
      let probe = await Company.findOne({ slug: `${companySlug}-${n}` }).lean();
      while (probe) {
        n += 1;
        probe = await Company.findOne({ slug: `${companySlug}-${n}` }).lean();
      }
      companySlug = `${companySlug}-${n}`;
    }

    if (dryRun) {
      console.log(
        `  [${org.slug}] "${org.name}" -> would create Company "${companySlug}"`
      );
      continue;
    }

    const company = new Company({
      slug: companySlug,
      name: org.name,
      branding: org.branding || {},
      status: "active"
    });
    await company.save();

    await Organization.updateOne(
      { _id: org._id },
      { companyId: company._id, status: org.status || "active" }
    );
    console.log(
      `  [${org.slug}] "${org.name}" -> Company "${companySlug}" (${company._id})`
    );
    created += 1;
  }

  console.log(
    dryRun
      ? `Dry run complete. ${created} Company row(s) would be created.`
      : `Migration complete. ${created} Company row(s) created / outlets linked.`
  );

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
