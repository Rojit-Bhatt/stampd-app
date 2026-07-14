const MenuItem = require("../models/MenuItem");
// xlsx@0.18.5 (the last version published to npm) has unpatched High-severity
// advisories on this exact parse path: GHSA-4r6h-8v6p-xvw6 (prototype
// pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS). No npm-published fix exists —
// SheetJS only publishes patched builds on their own CDN. Risk accepted:
// parseMenuWorkbook only runs on files uploaded through POST
// /api/admin/menu/import, which requires isBusinessAdmin auth — reachable
// only by an authenticated tenant admin, never the public. Revisit if this
// parsing path is ever exposed to unauthenticated or cross-tenant input.
const XLSX = require("xlsx");

const MAX_IMPORT_ROWS = 500;

const normalizeHeader = (h) => String(h || "").trim().toLowerCase();

// Reads an uploaded workbook buffer and returns the valid rows plus a count
// of skipped ones (missing/blank Name, or beyond the 500-row cap). Headers
// are matched case-insensitively; column order doesn't matter.
const parseMenuWorkbook = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const rows = [];
  let skipped = 0;

  for (const record of records) {
    const fieldByHeader = {};
    for (const [key, value] of Object.entries(record)) {
      fieldByHeader[normalizeHeader(key)] = value;
    }

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
      price: String(fieldByHeader.price || "").trim(),
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
    price: price !== undefined ? price : "",
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
      safeUpdates[field] = updates[field];
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

const importMenuItems = async (organizationId, buffer) => {
  const { rows, skipped } = parseMenuWorkbook(buffer);

  if (rows.length > 0) {
    await MenuItem.create(
      rows.map((row) => ({
        organizationId,
        name: row.name,
        description: row.description,
        price: row.price,
        category: row.category,
        isAvailable: true,
        sortOrder: 0
      }))
    );
  }

  return { imported: rows.length, skipped };
};

const buildMenuTemplate = () => {
  const aoa = [
    ["Name", "Price", "Category", "Description"],
    ["Cappuccino", "₹150", "Coffee", "Rich and creamy espresso with steamed milk"]
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Menu");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

module.exports = {
  createHttpError,
  listForOrg,
  createItem,
  updateItem,
  deleteItem,
  parseMenuWorkbook,
  importMenuItems,
  buildMenuTemplate
};
