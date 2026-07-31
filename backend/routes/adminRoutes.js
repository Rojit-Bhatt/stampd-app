const express = require("express");
const {
  generateAdminQRToken,
  generateAdminRedeemToken,
  getTransactions,
  getCustomersList
} = require("../controllers/pointsController");
const { getMySettings, updateMySettings } = require("../controllers/tenantController");
const {
  listMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuFile,
  previewMenuImport,
  confirmMenuImport,
  downloadMenuTemplate
} = require("../controllers/menuController");
const {
  getDashboard,
  getSummary,
  getTierDistribution,
  downloadSummary,
  downloadCustomers,
  downloadTransactions,
} = require("../controllers/reportController");
const { listEvents, createEventController, updateEventController, deleteEventController } = require("../controllers/eventController");
const campaignController = require("../controllers/campaignController");
const rewardController = require("../controllers/rewardController");
const broadcastController = require("../controllers/broadcastController");
const { uploadImageFile, uploadImage, deleteImage } = require("../controllers/imageController");
const { verifyToken, isBusinessAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// Both sides of the counter are staff-initiated: earn carries the bill,
// redeem carries nothing and lets the customer pick after scanning.
router.post("/generate-qr", verifyToken, isBusinessAdmin, generateAdminQRToken);
router.post("/generate-redeem-qr", verifyToken, isBusinessAdmin, generateAdminRedeemToken);
router.get("/transactions", verifyToken, isBusinessAdmin, getTransactions);
router.get("/customers", verifyToken, isBusinessAdmin, getCustomersList);
router.get("/settings", verifyToken, isBusinessAdmin, getMySettings);
router.patch("/settings", verifyToken, isBusinessAdmin, updateMySettings);
router.get("/menu", verifyToken, isBusinessAdmin, listMenu);
router.post("/menu", verifyToken, isBusinessAdmin, createMenuItem);
router.post("/menu/import/preview", verifyToken, isBusinessAdmin, uploadMenuFile, previewMenuImport);
router.post("/menu/import/confirm", verifyToken, isBusinessAdmin, confirmMenuImport);
router.get("/menu/template", verifyToken, isBusinessAdmin, downloadMenuTemplate);
router.patch("/menu/:id", verifyToken, isBusinessAdmin, updateMenuItem);
router.delete("/menu/:id", verifyToken, isBusinessAdmin, deleteMenuItem);
router.get("/dashboard-stats", verifyToken, isBusinessAdmin, getDashboard);
router.get("/tier-distribution", verifyToken, isBusinessAdmin, getTierDistribution);
router.get("/reports/summary", verifyToken, isBusinessAdmin, getSummary);
router.get("/reports/summary/download", verifyToken, isBusinessAdmin, downloadSummary);
router.get("/reports/customers/download", verifyToken, isBusinessAdmin, downloadCustomers);
router.get("/reports/transactions/download", verifyToken, isBusinessAdmin, downloadTransactions);
// Campaigns change what a bill is worth; Events are display-only listings.
// Two different things, deliberately two different route groups.
router.get("/campaigns", verifyToken, isBusinessAdmin, campaignController.list);
router.post("/campaigns", verifyToken, isBusinessAdmin, campaignController.create);
router.patch("/campaigns/:id", verifyToken, isBusinessAdmin, campaignController.update);
router.delete("/campaigns/:id", verifyToken, isBusinessAdmin, campaignController.remove);

// Uploaded pictures for rewards, events and branding. The tenant comes from
// the JWT, never the request body — see imageController.
router.post("/images", verifyToken, isBusinessAdmin, uploadImageFile, uploadImage);
router.delete("/images/:id", verifyToken, isBusinessAdmin, deleteImage);

router.get("/rewards", verifyToken, isBusinessAdmin, rewardController.list);
router.post("/rewards", verifyToken, isBusinessAdmin, rewardController.create);
router.patch("/rewards/:id", verifyToken, isBusinessAdmin, rewardController.update);
router.delete("/rewards/:id", verifyToken, isBusinessAdmin, rewardController.remove);

router.get("/events", verifyToken, isBusinessAdmin, listEvents);
router.post("/events", verifyToken, isBusinessAdmin, createEventController);
router.patch("/events/:id", verifyToken, isBusinessAdmin, updateEventController);
router.delete("/events/:id", verifyToken, isBusinessAdmin, deleteEventController);

router.get("/broadcasts", verifyToken, isBusinessAdmin, broadcastController.list);
router.post("/broadcasts", verifyToken, isBusinessAdmin, broadcastController.create);
router.get("/broadcasts/:id", verifyToken, isBusinessAdmin, broadcastController.detail);
router.patch("/broadcasts/:id", verifyToken, isBusinessAdmin, broadcastController.update);
router.delete("/broadcasts/:id", verifyToken, isBusinessAdmin, broadcastController.remove);

module.exports = router;
