const multer = require("multer");
const {
  listForOrg,
  createItem,
  updateItem,
  deleteItem,
  buildImportPreview,
  confirmImport,
  buildMenuTemplate
} = require("../services/menuService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okType =
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel";
    if (!okType) {
      const error = new Error("Only .xlsx or .xls files are accepted.");
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  }
});

// Wraps upload.single so multer's own errors (wrong type, too large) reach
// the app's error-handling middleware as 400s instead of defaulting to 500.
const uploadMenuFile = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        error.statusCode = 400;
      }
      return next(error);
    }
    next();
  });
};

const previewMenuImport = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("An Excel file is required.");
      error.statusCode = 400;
      throw error;
    }
    const result = await buildImportPreview(req.user.organizationId, req.file.buffer);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const confirmMenuImport = async (req, res, next) => {
  try {
    const result = await confirmImport(req.user.organizationId, req.body.rows);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const downloadMenuTemplate = async (req, res, next) => {
  try {
    const buffer = await buildMenuTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=\"menu-template.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

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
  deleteMenuItem,
  uploadMenuFile,
  previewMenuImport,
  confirmMenuImport,
  downloadMenuTemplate
};
