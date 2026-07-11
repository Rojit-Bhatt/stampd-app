const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { getCustomerWallet } = require("../controllers/voucherController");

const router = express.Router();

router.get("/my-wallet", verifyToken, getCustomerWallet);

module.exports = router;
