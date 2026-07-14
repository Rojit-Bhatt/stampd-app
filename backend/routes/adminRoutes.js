const express = require("express");
const {
  generateAdminQRToken,
  getRecentScans,
  getCustomersList
} = require("../controllers/stampController");
const { redeemAdminVoucher } = require("../controllers/voucherController");
const { getMySettings, updateMySettings } = require("../controllers/tenantController");
const {
  listMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
} = require("../controllers/menuController");
const { verifyToken, isBusinessAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/generate-qr", verifyToken, isBusinessAdmin, generateAdminQRToken);
router.post("/redeem-voucher", verifyToken, isBusinessAdmin, redeemAdminVoucher);
router.get("/recent-scans", verifyToken, isBusinessAdmin, getRecentScans);
router.get("/customers", verifyToken, isBusinessAdmin, getCustomersList);
router.get("/settings", verifyToken, isBusinessAdmin, getMySettings);
router.patch("/settings", verifyToken, isBusinessAdmin, updateMySettings);
router.get("/menu", verifyToken, isBusinessAdmin, listMenu);
router.post("/menu", verifyToken, isBusinessAdmin, createMenuItem);
router.patch("/menu/:id", verifyToken, isBusinessAdmin, updateMenuItem);
router.delete("/menu/:id", verifyToken, isBusinessAdmin, deleteMenuItem);

module.exports = router;
