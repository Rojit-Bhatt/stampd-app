const express = require("express");
const { getPublicMenu } = require("../controllers/menuController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { cacheMiddleware } = require("../utils/responseCache");

const router = express.Router();

// Cached — identical for every visitor of this tenant until a menu edit
// purges the key. compression() still runs after the cache layer, so the
// cached (uncompressed) body is compressed exactly once in transit.
router.get("/", resolveTenant, cacheMiddleware({ kind: "publicMenu", ttlMs: 5 * 60 * 1000 }), getPublicMenu);

module.exports = router;
