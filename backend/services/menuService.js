const MenuItem = require("../models/MenuItem");

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
const MUTABLE_MENU_FIELDS = ["name", "description", "price", "category", "isAvailable", "sortOrder"];

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

module.exports = {
  createHttpError,
  listForOrg,
  createItem,
  updateItem,
  deleteItem
};
