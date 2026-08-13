const PointsTransaction = require("../models/PointsTransaction");
const MenuItem = require("../models/MenuItem");

// One-time, idempotent backfill: historical menu-item redemptions that were
// written before `rewardValueNpr` existed (or by a path that didn't snapshot
// it) end up with an honest "—" in the redeem report even though the item is
// on the menu and has a cash price. This derives the value from the CURRENT
// catalog price — an approximation the owner explicitly accepted — because
// the true historical price is lost; null stays null whenever no price can
// be derived, so "—" always means "not recorded", never "free".
//
// What gets a value:   type === "redeem", rewardKind === "menu",
//                      rewardRef points at an existing MenuItem with a
//                      numeric price, rewardValueNpr null/missing.
// What stays null:     points-only RewardItem rows, orphaned refs (deleted
//                      item), rows whose item has no price, rows already
//                      valued, rows with no kind (older legacy rows).
//
// Idempotent — re-running writes nothing; dry-run reports counts without
// touching the DB.

const backfillRedeemValues = async (organizationId, { dryRun = false } = {}) => {
  // `rewardRef: { $ne: null }` is expressed in JS (not a query operator) so
  // the in-memory mock engine — which only implements a small operator set —
  // returns the same results as the real driver.
  const rows = (await PointsTransaction.find({ organizationId, type: "redeem", rewardKind: "menu" }))
    .filter((r) => r.rewardRef != null);

  // Count points-only RewardItem redemptions up front so the report tells
  // the owner how many rows were intentionally skipped — they are excluded
  // below by the menu-only find, since a standalone reward has no cash price
  // by definition (a tote bag is never sold).
  const rewardRows = (await PointsTransaction.find({ organizationId, type: "redeem", rewardKind: "reward" }))
    .filter((r) => r.rewardRef != null);
  const report = {
    dryRun,
    range: { startDate: "2000-01-01", endDate: new Date().toISOString().slice(0, 10) },
    backfilled: 0,
    skipped: { alreadyValued: 0, noPrice: 0, orphaned: 0, pointsOnlyReward: rewardRows.length, other: 0 }
  };

  // Batch-resolve every distinct referenced menu item. The $in operator is
  // fine here — the filter above (rewardKind === "menu") already excluded
  // RewardItem rows, so this only touches menu references. Unknown ids (item
  // deleted) and items with no price each get their own skip bucket so the
  // dry-run output tells the owner what is and isn't recoverable.
  const itemIds = [...new Set(rows.map((r) => r.rewardRef.toString()))];
  const items = itemIds.length > 0
    ? await MenuItem.find({ _id: { $in: itemIds }, organizationId })
    : [];
  // Resolve every referenced id — including items with no price — so a row
  // whose item exists but is priceless lands in its own skip bucket instead
  // of being lumped together with deleted items.
  const priceById = new Map();
  for (const item of items) {
    priceById.set(item._id.toString(), typeof item.price === "number" ? item.price : null);
  }

  for (const row of rows) {
    if (typeof row.rewardValueNpr === "number") {
      report.skipped.alreadyValued += 1;
      continue;
    }
    const price = priceById.get(row.rewardRef.toString());
    if (price === null) {
      // The item still exists on the menu but has no cash price — there is
      // no honest value to derive, and null must never mean "free".
      report.skipped.noPrice += 1;
      continue;
    }
    if (price === undefined) {
      // Referenced item was deleted from the menu — price is lost forever.
      report.skipped.orphaned += 1;
      continue;
    }
    if (dryRun) {
      report.backfilled += 1;
      continue;
    }
    await PointsTransaction.updateOne(
      { _id: row._id, rewardValueNpr: null },
      { $set: { rewardValueNpr: price } }
    );
    report.backfilled += 1;
  }

  return { success: true, report };
};

module.exports = { backfillRedeemValues };
