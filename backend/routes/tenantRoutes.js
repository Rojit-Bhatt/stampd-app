const express = require("express");
const { getPublicTenant } = require("../controllers/tenantController");
const { resolveTenant } = require("../middleware/tenantMiddleware");

const router = express.Router();

router.get("/", resolveTenant, getPublicTenant);

module.exports = router;
