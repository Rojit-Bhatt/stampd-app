const express = require("express");
const {
  platformLogin,
  getCompanies,
  postCompany,
  getCompany,
  patchCompany,
  patchOutlet,
  getAuditLog,
  getAnalytics,
  downloadCompaniesReport,
  getPublicStats,
  getPublicPlans,
  getPublicPlatformContact,
  getPlatformContactAdmin,
  patchPlatformContact,
  getSanityChecksum
} = require("../controllers/platformController");
const { getAdmins, postAdmin, deleteAdmin } = require("../controllers/platformTeamController");
const { verifyToken, isPlatformAdmin, isPlatformOwner } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimitMiddleware");
const { verifyTurnstile } = require("../middleware/turnstileMiddleware");

const router = express.Router();

router.post("/login", authLimiter, verifyTurnstile, platformLogin);
// Second MFA step for platform admins — same challenge-token contract as the
// customer flow (see customerAccountRoutes /login/mfa).
router.post("/login/mfa", authLimiter, require("../controllers/platformMfaController").completeMfaLogin);

// Platform-admin MFA lifecycle — gated by the same ENABLE_MFA flag; every
// endpoint 404s when the flag is off. Admin rows carry their own mfa fields.
const platformMfa = require("../controllers/platformMfaController");
router.get("/me/mfa/status", verifyToken, isPlatformAdmin, platformMfa.assertMfaAvailable, platformMfa.status);
router.post("/me/mfa/setup", verifyToken, isPlatformAdmin, platformMfa.assertMfaAvailable, platformMfa.setup);
router.post("/me/mfa/enable", verifyToken, isPlatformAdmin, platformMfa.assertMfaAvailable, platformMfa.enable);
router.post("/me/mfa/disable", authLimiter, verifyToken, isPlatformAdmin, platformMfa.assertMfaAvailable, platformMfa.disable);

// The platform registers companies; each company then registers its own
// outlets. The platform keeps read access to every outlet and can still
// edit/suspend one.
router.get("/companies", verifyToken, isPlatformAdmin, getCompanies);
router.post("/companies", verifyToken, isPlatformOwner, postCompany);
router.get("/companies/:id", verifyToken, isPlatformAdmin, getCompany);
router.patch("/companies/:id", verifyToken, isPlatformOwner, patchCompany);
router.patch("/outlets/:outletId", verifyToken, isPlatformOwner, patchOutlet);

// Daily sanity digest (G11 — backups/DR): platform-admin only; operators
// or an external cron job poll this once a day and diff the sha256 against
// a stored baseline to catch silent database corruption.
router.get("/sanity-checksum", verifyToken, isPlatformAdmin, getSanityChecksum);

router.get("/audit-log", verifyToken, isPlatformAdmin, getAuditLog);
router.get("/analytics", verifyToken, isPlatformAdmin, getAnalytics);
router.get("/analytics/companies-report/download", verifyToken, isPlatformAdmin, downloadCompaniesReport);
router.get("/admins", verifyToken, isPlatformOwner, getAdmins);
router.post("/admins", verifyToken, isPlatformOwner, postAdmin);
router.delete("/admins/:id", verifyToken, isPlatformOwner, deleteAdmin);
// Public marketing-site reads. Unauthenticated by design, and deliberately
// unthrottled: cheap aggregate reads with no auth surface and no write, same
// as public-contact. The rate limiters stay scoped to login/registration.
router.get("/public-stats", getPublicStats);
router.get("/public-plans", getPublicPlans);
router.get("/public-contact", getPublicPlatformContact);
router.get("/contact", verifyToken, isPlatformAdmin, getPlatformContactAdmin);
router.patch("/contact", verifyToken, isPlatformOwner, patchPlatformContact);

module.exports = router;
