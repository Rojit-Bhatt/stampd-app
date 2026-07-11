const express = require("express");
const { claimCustomerStamp } = require("../controllers/stampController");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/claim", verifyToken, claimCustomerStamp);

module.exports = router;
