const express = require("express");
const {
  register, login, googleAuth,
  verifyEmail, resendVerification, forgotPassword, resetPassword, completeProfile
} = require("../controllers/authController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { verifyToken } = require("../middleware/authMiddleware");
const { authLimiter, registrationLimiter } = require("../middleware/rateLimitMiddleware");
const { verifyTurnstile } = require("../middleware/turnstileMiddleware");

const router = express.Router();

router.post("/register", resolveTenant, registrationLimiter, verifyTurnstile, register);
router.post("/login", resolveTenant, authLimiter, verifyTurnstile, login);
router.post("/google", resolveTenant, authLimiter, googleAuth);
router.get("/verify-email", resolveTenant, verifyEmail);
router.post("/resend-verification", resolveTenant, registrationLimiter, resendVerification);
router.post("/forgot-password", resolveTenant, registrationLimiter, verifyTurnstile, forgotPassword);
router.post("/reset-password", resolveTenant, resetPassword);
router.post("/complete-profile", verifyToken, completeProfile);

module.exports = router;
