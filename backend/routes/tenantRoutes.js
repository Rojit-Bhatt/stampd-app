const express = require("express");
const { getPublicTenant } = require("../controllers/tenantController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { cacheMiddleware } = require("../utils/responseCache");

const router = express.Router();

// Cached — tenant info is read far more often than it changes.
router.get("/", resolveTenant, cacheMiddleware({ kind: "publicTenant", ttlMs: 30 * 60 * 1000 }), getPublicTenant);

module.exports = router;
