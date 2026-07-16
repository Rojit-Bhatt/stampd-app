const express = require("express");
const {
  getPublicPlans,
  getAdminPlans,
  postPlan,
  patchPlan,
  deletePlan
} = require("../controllers/subscriptionPlanController");
const { verifyToken, isPlatformAdmin, isPlatformOwner } = require("../middleware/authMiddleware");

const router = express.Router();

// Public — powers the pricing page and owner checkout plan picker.
router.get("/public", getPublicPlans);

router.get("/", verifyToken, isPlatformAdmin, getAdminPlans);
router.post("/", verifyToken, isPlatformOwner, postPlan);
router.patch("/:slug", verifyToken, isPlatformOwner, patchPlan);
router.delete("/:slug", verifyToken, isPlatformOwner, deletePlan);

module.exports = router;
