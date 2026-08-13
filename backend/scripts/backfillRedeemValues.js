/**
 * One-time migration: backfill "Value (Rs)" on historical menu-item
 * redemptions that were written before PointsTransaction.rewardValueNpr
 * existed (or by a redeem path that didn't snapshot it).
 *
 * For each qualifying row (type === "redeem", rewardKind === "menu",
 * rewardRef points at an existing MenuItem with a numeric price,
 * rewardValueNpr null), sets rewardValueNpr to the item's CURRENT menu
 * price — the owner accepted this as an approximation of the historical
 * price, which is otherwise lost. Rows that can't derive a price (deleted
 * item, item with no price, points-only rewards) are left null on purpose:
 * "—" in the report means "not recorded", never "free".
 *
 * Idempotent — re-running writes nothing already valued.
 * Dry-run mode (`--dry-run`) reports the counts without touching the DB.
 *
 * Usage:
 *   node backend/scripts/backfillRedeemValues.js               # apply
 *   node backend/scripts/backfillRedeemValues.js --dry-run     # preview
 *
 * NOTE: runs against the REAL database (backend/.env), not the mock DB —
 * this is a data-correction run, not a unit test. The in-memory fallback
 * would silently skip every real row and claim success.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const connectDB = require("../config/db");
const { backfillRedeemValues } = require("../services/backfillRedeemService");

async function backfillAll() {
  const dryRun = process.argv.includes("--dry-run");

  await connectDB();

  // Scope: every organization in the platform. Each org's rows are resolved
  // against that org's OWN menu only, so a cross-tenant leak is impossible
  // by construction (the service queries MenuItem with the same
  // organizationId).
  const Organization = require("../models/Organization");
  const orgs = await Organization.find({});
  console.log(
    `Scanning ${orgs.length} outlet(s). Mode: ${dryRun ? "DRY RUN" : "APPLY"}`
  );

  const totals = { backfilled: 0 };
  for (const org of orgs) {
    const result = await backfillRedeemValues(org._id.toString(), { dryRun });
    if (result.report.backfilled > 0) {
      console.log(
        `[${org.slug}] backfilled ${result.report.backfilled} row(s); ` +
        `skipped: ${JSON.stringify(result.report.skipped)}`
      );
    }
    totals.backfilled += result.report.backfilled;
  }

  console.log(
    dryRun
      ? `Dry run complete. ${totals.backfilled} row(s) would be backfilled.`
      : `Migration complete. ${totals.backfilled} row(s) backfilled.`
  );

  await require("mongoose").connection.close();
}

backfillAll().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
