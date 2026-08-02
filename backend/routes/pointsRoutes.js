const express = require("express");
const {
  claimCustomerPoints,
  redeemCustomerPoints,
  getCatalog,
  getCampaigns,
  getBalance,
  getHistory,
  getLeaderboardForCustomer
} = require("../controllers/pointsController");
const { verifyToken } = require("../middleware/authMiddleware");

// Customer-side loyalty. The tenant always comes from the JWT, never the
// URL — a customer can only ever move their balance at the outlet their
// token was issued for.
const router = express.Router();

router.post("/claim", verifyToken, claimCustomerPoints);
router.post("/redeem", verifyToken, redeemCustomerPoints);
router.get("/catalog", verifyToken, getCatalog);
router.get("/campaigns", verifyToken, getCampaigns);
router.get("/balance", verifyToken, getBalance);
router.get("/history", verifyToken, getHistory);
router.get("/leaderboard", verifyToken, getLeaderboardForCustomer);

module.exports = router;
