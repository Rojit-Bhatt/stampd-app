const express = require("express");
const {
  register, login, googleAuth,
  verifyEmail, resendVerification, forgotPassword, resetPassword, completeProfile
} = require("../controllers/authController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", resolveTenant, register);
router.post("/login", resolveTenant, login);
router.post("/google", resolveTenant, googleAuth);
router.get("/verify-email", resolveTenant, verifyEmail);
router.post("/resend-verification", resolveTenant, resendVerification);
router.post("/forgot-password", resolveTenant, forgotPassword);
router.post("/reset-password", resolveTenant, resetPassword);
router.post("/complete-profile", verifyToken, completeProfile);

module.exports = router;
