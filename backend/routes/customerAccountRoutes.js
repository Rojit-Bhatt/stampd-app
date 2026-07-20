const express = require("express");
const {
  register, login, googleAuth,
  verifyEmail, resendVerification, forgotPassword, resetPassword,
  completeProfile, enterTenant, getMyTenants,
  uploadAvatarFile, uploadAvatar, deleteAvatar, getAvatar
} = require("../controllers/customerAccountController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { verifyGlobalSession } = require("../middleware/customerAuthMiddleware");
const { authLimiter, registrationLimiter } = require("../middleware/rateLimitMiddleware");
const { discover } = require("../controllers/discoveryController");

const router = express.Router();

// Global — no tenant context at all. Rate-limited on the abuse-prone
// endpoints (see rateLimitMiddleware); google/verify-email/reset-password are
// token- or provider-gated already and left unthrottled.
router.post("/register", registrationLimiter, register);
router.post("/login", authLimiter, login);
router.post("/google", googleAuth);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", registrationLimiter, resendVerification);
router.post("/forgot-password", registrationLimiter, forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/complete-profile", verifyGlobalSession, completeProfile);

// Profile picture. Writes need the global session (the avatar belongs to the
// CustomerAccount, not to any one outlet's membership); the read is public
// because it is loaded by an <img> tag — see getAvatarController.
router.post("/avatar", verifyGlobalSession, uploadAvatarFile, uploadAvatar);
router.delete("/avatar", verifyGlobalSession, deleteAvatar);
router.get("/avatar/:accountId", getAvatar);

// Needs a resolved tenant (which org to provision into) + a valid global
// session (which account) — the exchange for a tenant JWT.
router.post("/enter-tenant", resolveTenant, verifyGlobalSession, enterTenant);

// Cross-tenant customer surface (/explore) — global session only, no tenant.
router.get("/discover", verifyGlobalSession, discover);
router.get("/my-tenants", verifyGlobalSession, getMyTenants);

module.exports = router;
