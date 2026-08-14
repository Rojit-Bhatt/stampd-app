const express = require("express");
const {
  getPublicPlans,
  getAdminPlans,
  postPlan,
  patchPlan,
  deletePlan
} = require("../controllers/subscriptionPlanController");
const { cacheMiddleware } = require("../utils/responseCache");
const { verifyToken, isPlatformAdmin, isPlatformOwner } = require("../middleware/authMiddleware");

const router = express.Router();

// Public — powers the pricing page and owner checkout plan picker. Cached —
// plans change rarely and every visitor sees the same catalog.
router.get("/public", cacheMiddleware({ kind: "publicPlans", tenantKey: () => "global" }), getPublicPlans);

router.get("/", verifyToken, isPlatformAdmin, getAdminPlans);
router.post("/", verifyToken, isPlatformOwner, postPlan);
router.patch("/:slug", verifyToken, isPlatformOwner, patchPlan);
router.delete("/:slug", verifyToken, isPlatformOwner, deletePlan);

module.exports = router;
