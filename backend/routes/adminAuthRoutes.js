const express = require("express");
const {
  login, verifyEmail, verifyOtp, resendVerification, forgotPassword, resetPassword
} = require("../controllers/adminAuthController");
const { authLimiter, registrationLimiter } = require("../middleware/rateLimitMiddleware");
const { verifyTurnstile } = require("../middleware/turnstileMiddleware");

const router = express.Router();

// Every route here is deliberately slug-less: an AdminAccount is a global
// staff identity, and the whole point of the unified login is that the
// credentials decide which company/outlet you belong to.
router.post("/login", authLimiter, verifyTurnstile, login);
router.get("/verify-email", verifyEmail);
router.post("/verify-otp", authLimiter, verifyOtp);
router.post("/resend-verification", registrationLimiter, verifyTurnstile, resendVerification);
router.post("/forgot-password", registrationLimiter, verifyTurnstile, forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
