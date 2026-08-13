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
  getPlatformCustomers,
  downloadCustomersReport
} = require("../controllers/platformController");
const { getAdmins, postAdmin, deleteAdmin } = require("../controllers/platformTeamController");
const { verifyToken, isPlatformAdmin, isPlatformOwner } = require("../middleware/authMiddleware");
const {
  authLimiter,
  platformExportLimiter,
} = require("../middleware/rateLimitMiddleware");
const { verifyTurnstile } = require("../middleware/turnstileMiddleware");

const router = express.Router();

router.post("/login", authLimiter, verifyTurnstile, platformLogin);

// The platform registers companies; each company then registers its own
// outlets. The platform keeps read access to every outlet and can still
// edit/suspend one.
router.get("/companies", verifyToken, isPlatformAdmin, getCompanies);
router.post("/companies", verifyToken, isPlatformOwner, postCompany);
router.get("/companies/:id", verifyToken, isPlatformAdmin, getCompany);
router.patch("/companies/:id", verifyToken, isPlatformOwner, patchCompany);
router.patch("/outlets/:outletId", verifyToken, isPlatformOwner, patchOutlet);

router.get("/audit-log", verifyToken, isPlatformAdmin, getAuditLog);
router.get("/analytics", verifyToken, isPlatformAdmin, getAnalytics);
router.get("/analytics/companies-report/download", verifyToken, isPlatformAdmin, platformExportLimiter, downloadCompaniesReport);

// Every registered customer — identity, membership location, points state
// and verification. Report download first so the literal path "customers"
// never shadows the report path (they do not clash, but list the specific
// report route first for the same reason as the companies-report pair).
router.get("/customers/report/download", verifyToken, isPlatformAdmin, platformExportLimiter, downloadCustomersReport);
router.get("/customers", verifyToken, isPlatformAdmin, getPlatformCustomers);
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
