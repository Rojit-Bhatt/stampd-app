const express = require("express");
const {
  register, login, googleAuth,
  verifyEmail, verifyOtp, resendVerification, forgotPassword, resetPassword,
  getMe, completeProfile, updateProfile, updatePreferences, savePushSubscription, removePushSubscription, changePassword, enterTenant, getMyTenants,
  uploadAvatarFile, uploadAvatar, deleteAvatar, getAvatar,
  exportData, deleteAccount
} = require("../controllers/customerAccountController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { verifyGlobalSession } = require("../middleware/customerAuthMiddleware");
const { authLimiter, registrationLimiter, uploadLimiter } = require("../middleware/rateLimitMiddleware");
const { verifyTurnstile } = require("../middleware/turnstileMiddleware");
const { discover, events: exploreEvents } = require("../controllers/discoveryController");

const router = express.Router();

// Global — no tenant context at all. Rate-limited on the abuse-prone
// endpoints (see rateLimitMiddleware); google/verify-email/reset-password are
// token- or provider-gated already and left unthrottled.
router.post("/register", registrationLimiter, verifyTurnstile, register);
router.post("/login", authLimiter, verifyTurnstile, login);
// Second MFA step — only meaningful after a login response with needsMfa:
// not gated by verifyGlobalSession because the caller holds no session yet,
// and it is the controller (completeMfaLogin) that validates the challenge
// token instead. Rate-limited like login: it is the next hop in the flow.
router.post("/login/mfa", authLimiter, require("../controllers/mfaController").completeMfaLogin);
router.post("/google", googleAuth);
router.get("/verify-email", verifyEmail);
router.post("/verify-otp", authLimiter, verifyOtp);
router.post("/resend-verification", registrationLimiter, verifyTurnstile, resendVerification);
router.post("/forgot-password", registrationLimiter, verifyTurnstile, forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/complete-profile", verifyGlobalSession, completeProfile);

// Fresh account snapshot from the server — the client's cached globalAccount
// (localStorage, refreshed only on explicit login/register/completeProfile
// in that tab) can drift stale, e.g. phone added from a different device or
// tab. Gates that trust globalAccount.phone revalidate against this first.
router.get("/me", verifyGlobalSession, getMe);

// (G17) Account deletion — own account only, email confirmation required by
// the service (prevents a stolen session from wiping the account silently).
router.post("/delete", authLimiter, verifyGlobalSession, deleteAccount);

// (G17) Self-service data export — own account only. Rate-limited: it is a
// bulk read, and repeated calls cost DB work proportional to membership
// history rather than the cheap lookups above.
router.get("/data", authLimiter, verifyGlobalSession, exportData);

// Name and password live on the CustomerAccount. The tenant-scoped
// /api/account equivalents write the outlet membership row instead, where a
// rename is reverted by the next ensureMembership sync and a password change
// never reaches what sign-in actually checks — so the customer app uses
// these, and /api/account is left to staff and platform admins.
router.patch("/profile", verifyGlobalSession, updateProfile);
router.patch("/preferences", verifyGlobalSession, updatePreferences);
router.post("/push-subscription", verifyGlobalSession, savePushSubscription);
router.delete("/push-subscription", verifyGlobalSession, removePushSubscription);
router.post("/change-password", authLimiter, verifyGlobalSession, changePassword);

// Profile picture. Writes need the global session (the avatar belongs to the
// CustomerAccount, not to any one outlet's membership); the read is public
// because it is loaded by an <img> tag — see getAvatarController.
router.post("/avatar", uploadLimiter, verifyGlobalSession, uploadAvatarFile, uploadAvatar);
router.delete("/avatar", verifyGlobalSession, deleteAvatar);
router.get("/avatar/:accountId", getAvatar);

// Needs a resolved tenant (which org to provision into) + a valid global
// session (which account) — the exchange for a tenant JWT.
router.post("/enter-tenant", resolveTenant, verifyGlobalSession, enterTenant);

// MFA lifecycle — every endpoint is a no-op (404) unless ENABLE_MFA=true,
// so the flag alone controls the whole surface. setup/enable need no session
// (the fresh URI is the proof-of-ownership contract); disable + status need
// the global session, and disable additionally wants password + a code.
const mfa = require("../controllers/mfaController");
router.post("/mfa/setup", verifyGlobalSession, mfa.assertMfaAvailable, mfa.setup);
router.post("/mfa/enable", verifyGlobalSession, mfa.assertMfaAvailable, mfa.enable);
router.post("/mfa/disable", authLimiter, verifyGlobalSession, mfa.assertMfaAvailable, mfa.disable);
router.get("/mfa/status", verifyGlobalSession, mfa.assertMfaAvailable, mfa.status);

// Cross-tenant customer surface (/explore) — global session only, no tenant.
router.get("/discover", verifyGlobalSession, discover);
router.get("/events", verifyGlobalSession, exploreEvents);
router.get("/my-tenants", verifyGlobalSession, getMyTenants);

module.exports = router;
