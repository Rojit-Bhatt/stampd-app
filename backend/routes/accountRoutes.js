const express = require("express");
const { getMe, updateProfileController, changePasswordController } = require("../controllers/accountController");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/me", verifyToken, getMe);
router.patch("/profile", verifyToken, updateProfileController);
router.post("/change-password", verifyToken, changePasswordController);

module.exports = router;
