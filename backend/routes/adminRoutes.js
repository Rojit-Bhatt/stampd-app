const express = require("express");
const { generateAdminQRToken, getRecentScans } = require("../controllers/stampController");
const { redeemAdminVoucher } = require("../controllers/voucherController");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/generate-qr", verifyToken, isAdmin, generateAdminQRToken);
router.post("/redeem-voucher", verifyToken, isAdmin, redeemAdminVoucher);
router.get("/recent-scans", verifyToken, isAdmin, getRecentScans);

module.exports = router;
