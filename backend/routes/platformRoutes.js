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
  getPublicPlatformContact,
  getPlatformContactAdmin,
  patchPlatformContact
} = require("../controllers/platformController");
const { getAdmins, postAdmin, deleteAdmin } = require("../controllers/platformTeamController");
const { verifyToken, isPlatformAdmin, isPlatformOwner } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", platformLogin);

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
router.get("/admins", verifyToken, isPlatformOwner, getAdmins);
router.post("/admins", verifyToken, isPlatformOwner, postAdmin);
router.delete("/admins/:id", verifyToken, isPlatformOwner, deleteAdmin);
router.get("/public-contact", getPublicPlatformContact);
router.get("/contact", verifyToken, isPlatformAdmin, getPlatformContactAdmin);
router.patch("/contact", verifyToken, isPlatformOwner, patchPlatformContact);

module.exports = router;
