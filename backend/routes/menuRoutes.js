const express = require("express");
const { getPublicMenu } = require("../controllers/menuController");
const { resolveTenant } = require("../middleware/tenantMiddleware");

const router = express.Router();

router.get("/", resolveTenant, getPublicMenu);

module.exports = router;
