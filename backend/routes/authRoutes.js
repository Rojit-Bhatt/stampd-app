const express = require("express");
const { register, login, googleAuth } = require("../controllers/authController");
const { resolveTenant } = require("../middleware/tenantMiddleware");

const router = express.Router();

router.post("/register", resolveTenant, register);
router.post("/login", resolveTenant, login);
router.post("/google", resolveTenant, googleAuth);

module.exports = router;
