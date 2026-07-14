const express = require("express");
const {
  platformLogin,
  getBusinesses,
  postBusiness,
  getBusinessById,
  patchBusiness
} = require("../controllers/platformController");
const { verifyToken, isPlatformAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", platformLogin);
router.get("/businesses", verifyToken, isPlatformAdmin, getBusinesses);
router.post("/businesses", verifyToken, isPlatformAdmin, postBusiness);
router.get("/businesses/:id", verifyToken, isPlatformAdmin, getBusinessById);
router.patch("/businesses/:id", verifyToken, isPlatformAdmin, patchBusiness);

module.exports = router;
