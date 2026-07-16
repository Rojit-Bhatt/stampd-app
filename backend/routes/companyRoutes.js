const express = require("express");
const {
  getMyCompany,
  getOutlets,
  postOutlet,
  deleteOutlet,
  postRestoreOutlet,
  postEnterOutlet,
  getSubscription,
  postRedeemKey,
  getRollup
} = require("../controllers/companyController");
const { verifyCompanySession } = require("../middleware/companyAuthMiddleware");

const router = express.Router();

// Every route is company-owner-only. Subscription management lives here and
// ONLY here — an outlet admin can no longer view or redeem against the
// company's plan.
router.use(verifyCompanySession);

router.get("/me", getMyCompany);
router.get("/outlets", getOutlets);
router.post("/outlets", postOutlet);
router.delete("/outlets/:id", deleteOutlet);
router.post("/outlets/:id/restore", postRestoreOutlet);
router.post("/enter-outlet", postEnterOutlet);
router.get("/subscription", getSubscription);
router.post("/subscription/redeem-key", postRedeemKey);
router.get("/reports/rollup", getRollup);

module.exports = router;
