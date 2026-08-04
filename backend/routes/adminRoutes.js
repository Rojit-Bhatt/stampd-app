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
  getImpact,
  getTierDistribution,
  getLeaderboardReport,
  downloadSummary,
  downloadCustomers,
  downloadTransactions,
} = require("../controllers/reportController");
const { listEvents, createEventController, updateEventController, deleteEventController } = require("../controllers/eventController");
const campaignController = require("../controllers/campaignController");
const rewardController = require("../controllers/rewardController");
const broadcastController = require("../controllers/broadcastController");
const { uploadImageFile, uploadImage, deleteImage } = require("../controllers/imageController");
const staffController = require("../controllers/staffController");
const { getNotifications, postMarkRead, postMarkAllRead } = require("../controllers/notificationController");
const { verifyToken, isBusinessAdmin, requireStaffPermission } = require("../middleware/authMiddleware");
const { pinLimiter } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

// Shorthand so the route table stays readable at a glance.
const canSettings = requireStaffPermission("manage_settings");
const canCatalog = requireStaffPermission("manage_catalog");
const canMarketing = requireStaffPermission("manage_marketing");
const canReports = requireStaffPermission("view_reports");
const canStaff = requireStaffPermission("manage_staff");

// Deliberately left OPEN to every role, including "staff" — see the design
// doc §1.3: GET /settings (AdminGuard revalidates against it; a 403 here
// would strand staff in a permanent "Verifying credentials" loop), the two
// counter routes (gated by PIN instead, not role — §2), and the four
// catalog/marketing reads below (campaigns/menu/rewards/events — the
// customer app already publishes this data unauthenticated, and
// GenerateQr.tsx needs the live campaign multiplier BEFORE staff quote a
// number).
//
// Both sides of the counter are staff-initiated: earn carries the bill,
// redeem carries nothing and lets the customer pick after scanning.
// pinLimiter shares its bucket with verify-pin, so the inline PIN
// re-verification here can't be used to sweep the PIN space at a looser
// rate — and its `skip` means a PIN-less outlet is never counted at all.
router.post("/generate-qr", verifyToken, isBusinessAdmin, pinLimiter, generateAdminQRToken);
router.post("/generate-redeem-qr", verifyToken, isBusinessAdmin, pinLimiter, generateAdminRedeemToken);
// Deliberately NOT behind requireStaffPermission: a "staff" account calling
// this is the entire point. Rate-limited instead.
router.post("/verify-pin", verifyToken, isBusinessAdmin, pinLimiter, staffController.verifyPinController);
router.get("/transactions", verifyToken, isBusinessAdmin, canReports, getTransactions);
router.get("/customers", verifyToken, isBusinessAdmin, canReports, getCustomersList);
router.get("/settings", verifyToken, isBusinessAdmin, getMySettings);
router.patch("/settings", verifyToken, isBusinessAdmin, canSettings, updateMySettings);
router.get("/menu", verifyToken, isBusinessAdmin, listMenu);
router.post("/menu", verifyToken, isBusinessAdmin, canCatalog, createMenuItem);
router.post("/menu/import/preview", verifyToken, isBusinessAdmin, canCatalog, uploadMenuFile, previewMenuImport);
router.post("/menu/import/confirm", verifyToken, isBusinessAdmin, canCatalog, confirmMenuImport);
router.get("/menu/template", verifyToken, isBusinessAdmin, downloadMenuTemplate);
router.patch("/menu/:id", verifyToken, isBusinessAdmin, canCatalog, updateMenuItem);
router.delete("/menu/:id", verifyToken, isBusinessAdmin, canCatalog, deleteMenuItem);
router.get("/dashboard-stats", verifyToken, isBusinessAdmin, canReports, getDashboard);
router.get("/tier-distribution", verifyToken, isBusinessAdmin, canReports, getTierDistribution);
router.get("/leaderboard", verifyToken, isBusinessAdmin, canReports, getLeaderboardReport);
router.get("/reports/summary", verifyToken, isBusinessAdmin, canReports, getSummary);
// The value view. A report, so it sits behind the same view_reports gate.
router.get("/impact", verifyToken, isBusinessAdmin, canReports, getImpact);
router.get("/reports/summary/download", verifyToken, isBusinessAdmin, canReports, downloadSummary);
router.get("/reports/customers/download", verifyToken, isBusinessAdmin, canReports, downloadCustomers);
router.get("/reports/transactions/download", verifyToken, isBusinessAdmin, canReports, downloadTransactions);
// Campaigns change what a bill is worth; Events are display-only listings.
// Two different things, deliberately two different route groups.
router.get("/campaigns", verifyToken, isBusinessAdmin, campaignController.list);
router.post("/campaigns", verifyToken, isBusinessAdmin, canMarketing, campaignController.create);
router.patch("/campaigns/:id", verifyToken, isBusinessAdmin, canMarketing, campaignController.update);
router.delete("/campaigns/:id", verifyToken, isBusinessAdmin, canMarketing, campaignController.remove);

// Uploaded pictures for rewards, events and branding. The tenant comes from
// the JWT, never the request body — see imageController. The guard goes
// BEFORE the multer middleware — reject on role before buffering a file
// into memory.
router.post("/images", verifyToken, isBusinessAdmin, canCatalog, uploadImageFile, uploadImage);
router.delete("/images/:id", verifyToken, isBusinessAdmin, canCatalog, deleteImage);

router.get("/rewards", verifyToken, isBusinessAdmin, rewardController.list);
router.post("/rewards", verifyToken, isBusinessAdmin, canCatalog, rewardController.create);
router.patch("/rewards/:id", verifyToken, isBusinessAdmin, canCatalog, rewardController.update);
router.delete("/rewards/:id", verifyToken, isBusinessAdmin, canCatalog, rewardController.remove);

router.get("/events", verifyToken, isBusinessAdmin, listEvents);
router.post("/events", verifyToken, isBusinessAdmin, canMarketing, createEventController);
router.patch("/events/:id", verifyToken, isBusinessAdmin, canMarketing, updateEventController);
router.delete("/events/:id", verifyToken, isBusinessAdmin, canMarketing, deleteEventController);

// Unlike the catalog, a broadcast is NOT customer-visible — it holds message
// bodies and audience filters. Read is gated with the writes.
router.get("/broadcasts", verifyToken, isBusinessAdmin, canMarketing, broadcastController.list);
router.post("/broadcasts", verifyToken, isBusinessAdmin, canMarketing, broadcastController.create);
router.get("/broadcasts/:id", verifyToken, isBusinessAdmin, canMarketing, broadcastController.detail);
router.patch("/broadcasts/:id", verifyToken, isBusinessAdmin, canMarketing, broadcastController.update);
router.delete("/broadcasts/:id", verifyToken, isBusinessAdmin, canMarketing, broadcastController.remove);

router.get("/staff", verifyToken, isBusinessAdmin, canStaff, staffController.list);
router.post("/staff", verifyToken, isBusinessAdmin, canStaff, staffController.create);
router.patch("/staff/:id", verifyToken, isBusinessAdmin, canStaff, staffController.updateRole);
router.delete("/staff/:id", verifyToken, isBusinessAdmin, canStaff, staffController.remove);
// The one compound gate: manage_staff OR self. A manager cannot manage_staff,
// so without the self path it could never set a PIN and would be locked out
// of the counter the moment the outlet turns PINs on. Enforced in the
// service, which is why canStaff is absent here.
router.patch("/staff/:id/pin", verifyToken, isBusinessAdmin, pinLimiter, staffController.setPin);

router.get("/notifications", verifyToken, isBusinessAdmin, getNotifications);
router.post("/notifications/:id/read", verifyToken, isBusinessAdmin, postMarkRead);
router.post("/notifications/read-all", verifyToken, isBusinessAdmin, postMarkAllRead);

module.exports = router;
