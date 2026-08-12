const MenuItem = require("../models/MenuItem");
const ExcelJS = require("exceljs");
const { toCenti, toPoints } = require("../utils/pointsMath");
const { claimImage, deleteImage } = require("./imageService");

const MAX_IMPORT_ROWS = 500;

const normalizeHeader = (h) => String(h || "").trim().toLowerCase();

// The import's column name for a menu item's redeem price. Matched
// case-insensitively like every other header.
const POINTS_PRICE_HEADER = "points price";

// Strips currency symbols/whitespace and parses a number. Returns null for
// blank/unparseable input rather than throwing — price is optional.
const parsePrice = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

// A cell's .value can be a primitive, a Date, or a rich object (formula
// result, hyperlink, rich text) — this collapses all of those to plain text.
const cellText = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (value.richText) return value.richText.map((r) => r.text).join("");
    return "";
  }
  return String(value);
};

// Reads an uploaded workbook buffer and returns the valid rows plus a count
// of skipped ones (missing/blank Name, or beyond the 500-row cap). Headers
// are matched case-insensitively; column order doesn't matter.
const parseMenuWorkbook = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  const headerRow = sheet.getRow(1);
  const headerByColumn = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headerByColumn[colNumber] = normalizeHeader(cellText(cell.value));
  });

  // Whether the sheet carries a points-price column AT ALL, which is a
  // different question from whether a given cell is blank — see below.
  const hasPointsPriceColumn = Object.values(headerByColumn).includes(POINTS_PRICE_HEADER);

  const rows = [];
  let skipped = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const fieldByHeader = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headerByColumn[colNumber];
      if (header) fieldByHeader[header] = cellText(cell.value);
    });

    const name = String(fieldByHeader.name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    if (rows.length >= MAX_IMPORT_ROWS) {
      skipped += 1;
      continue;
    }

    rows.push({
      name,
      price: parsePrice(fieldByHeader.price),
      category: String(fieldByHeader.category || "").trim() || "General",
      description: String(fieldByHeader.description || "").trim(),
      // THREE states, not two, and the distinction is load-bearing:
      //   undefined — the sheet has no points-price column, so leave whatever
      //               the item already has alone
      //   null      — the column exists and this cell is blank: menu-only
      //   number    — redeemable at this price
      // Collapsing the first two would mean an admin re-importing an older
      // sheet silently wipes every points price they'd set.
      pointsPrice: hasPointsPriceColumn ? parsePrice(fieldByHeader[POINTS_PRICE_HEADER]) : undefined
    });
  }

  return { rows, skipped, hasPointsPriceColumn };
};

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Claims a freshly uploaded image onto the saved item and, on a replace,
// deletes the previous row so an outlet's storage never fills with orphan
// photos. Rewards/logos/events already did this — menu items were the gap:
// without the claim, the image row stayed "abandoned", and the 24h sweep
// removed it on the next upload from the same outlet, leaving the customer
// console asking /api/images/<id> for a row that no longer exists (404).
const applyImage = async ({ organizationId, ownerId, nextImageId, previousImageId }) => {
  if (nextImageId === previousImageId) return;
  if (nextImageId) {
    await claimImage({ id: nextImageId, organizationId, ownerId });
  }
  if (previousImageId) {
    await deleteImage({ id: previousImageId, organizationId });
  }
};

// Centipoints never leave the backend: converts pointsPriceCenti -> pointsPrice
// (real points) on the way out, the same rule pointsService's own catalog
// formatting follows. Every path that hands a menu item to a controller goes
// through this — listForOrg, createItem, updateItem — so no raw centipoint
// integer ever reaches a public or admin response.
const formatItem = (item) => {
  const obj = item.toObject ? item.toObject() : item;
  const { pointsPriceCenti, ...rest } = obj;
  return {
    ...rest,
    pointsPrice:
      pointsPriceCenti === null || pointsPriceCenti === undefined ? null : toPoints(pointsPriceCenti)
  };
};

const listForOrg = async (organizationId) => {
  const items = await MenuItem.find({ organizationId }).sort({ sortOrder: 1 });
  return items.map(formatItem);
};

const createItem = async (
  organizationId,
  { name, description, price, category, isAvailable, sortOrder, pointsPrice, imageUrl, imageId }
) => {
  if (!name) {
    throw createHttpError("Menu item name is required.", 400);
  }

  const parsedPointsPrice = pointsPrice === undefined ? null : parsePrice(pointsPrice);

  const item = await MenuItem.create({
    organizationId,
    name: name.trim(),
    description: description !== undefined ? description : "",
    imageUrl: imageUrl !== undefined ? imageUrl : "",
    imageId: imageId !== undefined ? imageId : null,
    price: price !== undefined ? parsePrice(price) : null,
    // null = menu-only, the default: giving an outlet a points program must
    // never put its whole menu up for redemption.
    pointsPriceCenti: parsedPointsPrice === null ? null : toCenti(parsedPointsPrice),
    category: category !== undefined ? category : "General",
    isAvailable: isAvailable !== undefined ? isAvailable : true,
    sortOrder: sortOrder !== undefined ? sortOrder : 0
  });

  await applyImage({
    organizationId,
    ownerId: item._id.toString(),
    nextImageId: imageId || null,
    previousImageId: null
  });

  return formatItem(item);
};

// Only these fields may be changed via the API — never organizationId or _id,
// so an admin can't move an item into (or out of) another tenant.
const MUTABLE_MENU_FIELDS = ["name", "description", "price", "category", "isAvailable", "isFeatured", "sortOrder", "imageUrl", "imageId"];

const updateItem = async (organizationId, itemId, updates) => {
  // Read the current image first — a replace or clear must delete the old
  // Image row, exactly like rewardService does for rewards.
  const current = await MenuItem.findOne({ _id: itemId, organizationId });
  if (!current) {
    throw createHttpError("Menu item not found.", 404);
  }

  // The old image id must be captured here, before findOneAndUpdate touches
  // the document: in the in-memory driver the $set mutates the same instance
  // findOne returned, so reading `current` later would show the NEW value.
  // For real MongoDB this is equally safe — findOneAndUpdate returns a fresh
  // document but capturing early costs nothing.
  const previousImageId = current.imageId || null;

  const safeUpdates = {};
  for (const field of MUTABLE_MENU_FIELDS) {
    if (updates[field] !== undefined) {
      // The admin console sends an empty string when the image picker is
      // cleared; an empty imageId means "no photo", same as null — and the
      // reward path normalizes the same way.
      safeUpdates[field] = field === "price" ? parsePrice(updates[field]) : (field === "imageId" ? (updates[field] || null) : updates[field]);
    }
  }

  // Handled apart from the whitelist loop because the API speaks points and
  // the column stores centipoints, and because `null` here is a real value
  // ("make this menu-only") that must survive the undefined check above.
  if (updates.pointsPrice !== undefined) {
    const parsed = parsePrice(updates.pointsPrice);
    safeUpdates.pointsPriceCenti = parsed === null ? null : toCenti(parsed);
  }

  const updatedItem = await MenuItem.findOneAndUpdate(
    { _id: itemId, organizationId },
    { $set: safeUpdates },
    { new: true }
  );

  if (!updatedItem) {
    throw createHttpError("Menu item not found.", 404);
  }

  await applyImage({
    organizationId,
    ownerId: updatedItem._id.toString(),
    // Empty string means "remove the photo", same convention the admin
    // console sends when the image picker is cleared.
    nextImageId: safeUpdates.imageId === "" ? null : (safeUpdates.imageId || null),
    previousImageId
  });

  return formatItem(updatedItem);
};

const deleteItem = async (organizationId, itemId) => {
  const item = await MenuItem.findOne({ _id: itemId, organizationId });

  const result = await MenuItem.deleteOne({ _id: itemId, organizationId });

  const deletedCount =
    result && typeof result.deletedCount === "number" ? result.deletedCount : 0;

  if (!deletedCount) {
    throw createHttpError("Menu item not found.", 404);
  }

  // The item's photo has no other owner — rewardService drops its reward
  // image the same way, so a deleted menu item leaves no orphaned rows.
  if (item && item.imageId) {
    await deleteImage({ id: item.imageId, organizationId });
  }

  return { success: true };
};

const normalizeName = (name) => String(name || "").trim().toLowerCase();

// Parses the workbook and, for every valid row, classifies it against the
// organization's current menu by name (case-insensitive, the only match key
// available — no SKU/id column exists in the import format):
//   - "new": no existing item with that name
//   - "changed": an existing item exists but price/points price/category/
//     description differ
//   - "unchanged": an existing item exists and every field is identical
// Nothing is written yet — the caller shows this diff to the admin, who
// approves a subset via confirmImport.
const buildImportPreview = async (organizationId, buffer) => {
  const { rows, skipped, hasPointsPriceColumn } = await parseMenuWorkbook(buffer);
  const existingItems = await MenuItem.find({ organizationId });

  const existingByName = new Map();
  for (const item of existingItems) {
    existingByName.set(normalizeName(item.name), item);
  }

  const previewRows = rows.map((row, index) => {
    const existing = existingByName.get(normalizeName(row.name));

    if (!existing) {
      return {
        key: `new-${index}`,
        status: "new",
        existingId: null,
        name: row.name,
        price: row.price,
        category: row.category,
        description: row.description,
        ...(hasPointsPriceColumn ? { pointsPrice: row.pointsPrice } : {})
      };
    }

    const existingPrice = existing.price === undefined ? null : existing.price;
    const samePrice = existingPrice === row.price;
    const sameCategory = String(existing.category || "").trim() === row.category;
    const sameDescription = String(existing.description || "").trim() === row.description;

    // Only a factor when the sheet actually carries the column. Without it,
    // the item's existing points price isn't being proposed for change at
    // all, so it can't make the row "changed".
    const existingPointsPrice =
      existing.pointsPriceCenti === null || existing.pointsPriceCenti === undefined
        ? null
        : toPoints(existing.pointsPriceCenti);
    const samePointsPrice = !hasPointsPriceColumn || existingPointsPrice === row.pointsPrice;

    const unchanged = samePrice && sameCategory && sameDescription && samePointsPrice;

    return {
      key: `existing-${existing._id}`,
      status: unchanged ? "unchanged" : "changed",
      existingId: String(existing._id),
      name: row.name,
      price: row.price,
      category: row.category,
      description: row.description,
      ...(hasPointsPriceColumn ? { pointsPrice: row.pointsPrice } : {}),
      previous: unchanged
        ? undefined
        : {
            price: existingPrice,
            category: existing.category,
            description: existing.description,
            ...(hasPointsPriceColumn ? { pointsPrice: existingPointsPrice } : {})
          }
    };
  });

  return {
    rows: previewRows,
    skipped,
    hasPointsPriceColumn,
    summary: {
      newCount: previewRows.filter((r) => r.status === "new").length,
      changedCount: previewRows.filter((r) => r.status === "changed").length,
      unchangedCount: previewRows.filter((r) => r.status === "unchanged").length
    }
  };
};

// Writes only the rows the admin approved (status "new"/"changed" — the
// client omits or ignores "unchanged" rows since there's nothing to write).
// Reuses createItem/updateItem so every write stays org-scoped and goes
// through the same validation/whitelisting as the manual "Add an item" form
// — including when a "changed" row's existingId was echoed back by the
// client from an earlier preview response: updateItem's own
// { _id, organizationId } filter means a tampered or stale id simply
// matches nothing rather than ever touching another tenant's row.
const confirmImport = async (organizationId, rows) => {
  if (!Array.isArray(rows)) {
    throw createHttpError("rows must be an array.", 400);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      skipped += 1;
      continue;
    }

    const name = String(row.name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    // Absent (not null) means the sheet had no points-price column, so the
    // item's existing price is left exactly as it was.
    const pointsPriceUpdate = "pointsPrice" in row ? { pointsPrice: row.pointsPrice } : {};

    if (row.status === "new") {
      await createItem(organizationId, {
        name,
        description: row.description || "",
        price: row.price,
        category: row.category || "General",
        ...pointsPriceUpdate
      });
      created += 1;
    } else if (row.status === "changed" && row.existingId) {
      try {
        await updateItem(organizationId, row.existingId, {
          description: row.description || "",
          price: row.price,
          category: row.category || "General",
          ...pointsPriceUpdate
        });
        updated += 1;
      } catch (error) {
        if (error.statusCode !== 404) throw error;
        skipped += 1;
      }
    } else {
      skipped += 1;
    }
  }

  return { created, updated, skipped };
};

const buildMenuTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Menu");
  sheet.addRow(["Name", "Price", "Points Price", "Category", "Description"]);
  sheet.addRow(["Cappuccino", "150", "150", "Coffee", "Rich and creamy espresso with steamed milk"]);
  // Second example row on purpose: a blank Points Price is how you say
  // "on the menu, but not redeemable".
  sheet.addRow(["Seasonal Tart", "320", "", "Food", "Menu only — not redeemable for points"]);
  return workbook.xlsx.writeBuffer();
};

module.exports = {
  createHttpError,
  parsePrice,
  listForOrg,
  createItem,
  updateItem,
  deleteItem,
  parseMenuWorkbook,
  buildImportPreview,
  confirmImport,
  buildMenuTemplate
};
