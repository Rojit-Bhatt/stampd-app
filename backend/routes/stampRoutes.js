const express = require("express");
const { claimCustomerStamp, getStampBalance } = require("../controllers/stampController");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/claim", verifyToken, claimCustomerStamp);
router.get("/balance", verifyToken, getStampBalance);

module.exports = router;
