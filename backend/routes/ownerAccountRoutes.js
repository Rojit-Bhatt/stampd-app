const express = require("express");
const {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  enterBusinessHandler,
  getMyBusinessesHandler,
  postBusiness,
  getSubscription,
  redeemMyKey
} = require("../controllers/ownerAccountController");
const { verifyOwnerSession } = require("../middleware/ownerAuthMiddleware");

const router = express.Router();

// Global — no tenant context at all.
router.post("/register", register);
router.post("/login", login);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Needs a valid global owner session — the exchange for a tenant JWT, and
// the cross-business dashboard list.
router.post("/enter-business", verifyOwnerSession, enterBusinessHandler);
router.get("/my-businesses", verifyOwnerSession, getMyBusinessesHandler);
router.post("/businesses", verifyOwnerSession, postBusiness);
router.get("/subscription", verifyOwnerSession, getSubscription);
router.post("/subscription/redeem-key", verifyOwnerSession, redeemMyKey);

module.exports = router;
