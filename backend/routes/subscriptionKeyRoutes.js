const express = require("express");
const { postKey, getKeys, deleteKey } = require("../controllers/subscriptionKeyController");
const { verifyToken, isPlatformAdmin, isPlatformOwner } = require("../middleware/authMiddleware");
const { validateBody } = require("../middleware/validateBody");
const { generateKeySchema } = require("../middleware/validateSchemas");

const router = express.Router();

router.get("/", verifyToken, isPlatformAdmin, getKeys);
// planSlug gates a paid plan's activation — validated here so the handler
// receives a cleaned slug (unknown keys stripped) rather than checking
// shapes twice.
router.post("/", verifyToken, isPlatformOwner, validateBody(generateKeySchema), postKey);
router.delete("/:code", verifyToken, isPlatformOwner, deleteKey);

module.exports = router;
