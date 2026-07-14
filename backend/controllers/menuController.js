const {
  listForOrg,
  createItem,
  updateItem,
  deleteItem
} = require("../services/menuService");

const getPublicMenu = async (req, res, next) => {
  try {
    const { organization } = req;

    if (!organization.menuEnabled) {
      return res.status(200).json({
        success: true,
        menuEnabled: false,
        items: []
      });
    }

    const items = await listForOrg(organization._id);
    const availableItems = items.filter((item) => item.isAvailable !== false);

    res.status(200).json({
      success: true,
      menuEnabled: true,
      items: availableItems
    });
  } catch (error) {
    next(error);
  }
};

const listMenu = async (req, res, next) => {
  try {
    const items = await listForOrg(req.user.organizationId);
    res.status(200).json({ success: true, items });
  } catch (error) {
    next(error);
  }
};

const createMenuItem = async (req, res, next) => {
  try {
    const { name, description, price, category, isAvailable, sortOrder } = req.body;
    const item = await createItem(req.user.organizationId, {
      name,
      description,
      price,
      category,
      isAvailable,
      sortOrder
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    next(error);
  }
};

const updateMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await updateItem(req.user.organizationId, id, req.body);
    res.status(200).json({ success: true, item });
  } catch (error) {
    next(error);
  }
};

const deleteMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await deleteItem(req.user.organizationId, id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPublicMenu,
  listMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
};
