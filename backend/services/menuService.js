const MenuItem = require("../models/MenuItem");
const ExcelJS = require("exceljs");

const MAX_IMPORT_ROWS = 500;

const normalizeHeader = (h) => String(h || "").trim().toLowerCase();

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
      description: String(fieldByHeader.description || "").trim()
    });
  }

  return { rows, skipped };
};

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const listForOrg = async (organizationId) => {
  return MenuItem.find({ organizationId }).sort({ sortOrder: 1 });
};

const createItem = async (
  organizationId,
  { name, description, price, category, isAvailable, sortOrder }
) => {
  if (!name) {
    throw createHttpError("Menu item name is required.", 400);
  }

  const item = await MenuItem.create({
    organizationId,
    name: name.trim(),
    description: description !== undefined ? description : "",
    price: price !== undefined ? parsePrice(price) : null,
    category: category !== undefined ? category : "General",
    isAvailable: isAvailable !== undefined ? isAvailable : true,
    sortOrder: sortOrder !== undefined ? sortOrder : 0
  });

  return item;
};

// Only these fields may be changed via the API — never organizationId or _id,
// so an admin can't move an item into (or out of) another tenant.
const MUTABLE_MENU_FIELDS = ["name", "description", "price", "category", "isAvailable", "isFeatured", "sortOrder"];

const updateItem = async (organizationId, itemId, updates) => {
  const safeUpdates = {};
  for (const field of MUTABLE_MENU_FIELDS) {
    if (updates[field] !== undefined) {
      safeUpdates[field] = field === "price" ? parsePrice(updates[field]) : updates[field];
    }
  }

  const updatedItem = await MenuItem.findOneAndUpdate(
    { _id: itemId, organizationId },
    { $set: safeUpdates },
    { new: true }
  );

  if (!updatedItem) {
    throw createHttpError("Menu item not found.", 404);
  }

  return updatedItem;
};

const deleteItem = async (organizationId, itemId) => {
  const result = await MenuItem.deleteOne({ _id: itemId, organizationId });

  const deletedCount =
    result && typeof result.deletedCount === "number" ? result.deletedCount : 0;

  if (!deletedCount) {
    throw createHttpError("Menu item not found.", 404);
  }

  return { success: true };
};

const normalizeName = (name) => String(name || "").trim().toLowerCase();

// Parses the workbook and, for every valid row, classifies it against the
// organization's current menu by name (case-insensitive, the only match key
// available — no SKU/id column exists in the import format):
//   - "new": no existing item with that name
//   - "changed": an existing item exists but price/category/description differ
//   - "unchanged": an existing item exists and every field is identical
// Nothing is written yet — the caller shows this diff to the admin, who
// approves a subset via confirmImport.
const buildImportPreview = async (organizationId, buffer) => {
  const { rows, skipped } = await parseMenuWorkbook(buffer);
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
        description: row.description
      };
    }

    const existingPrice = existing.price === undefined ? null : existing.price;
    const samePrice = existingPrice === row.price;
    const sameCategory = String(existing.category || "").trim() === row.category;
    const sameDescription = String(existing.description || "").trim() === row.description;
    const unchanged = samePrice && sameCategory && sameDescription;

    return {
      key: `existing-${existing._id}`,
      status: unchanged ? "unchanged" : "changed",
      existingId: String(existing._id),
      name: row.name,
      price: row.price,
      category: row.category,
      description: row.description,
      previous: unchanged
        ? undefined
        : { price: existingPrice, category: existing.category, description: existing.description }
    };
  });

  return {
    rows: previewRows,
    skipped,
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

    if (row.status === "new") {
      await createItem(organizationId, {
        name,
        description: row.description || "",
        price: row.price,
        category: row.category || "General"
      });
      created += 1;
    } else if (row.status === "changed" && row.existingId) {
      try {
        await updateItem(organizationId, row.existingId, {
          description: row.description || "",
          price: row.price,
          category: row.category || "General"
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
  sheet.addRow(["Name", "Price", "Category", "Description"]);
  sheet.addRow(["Cappuccino", "150", "Coffee", "Rich and creamy espresso with steamed milk"]);
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
