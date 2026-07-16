const express = require("express");
const { postKey, getKeys, deleteKey } = require("../controllers/subscriptionKeyController");
const { verifyToken, isPlatformAdmin, isPlatformOwner } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", verifyToken, isPlatformAdmin, getKeys);
router.post("/", verifyToken, isPlatformOwner, postKey);
router.delete("/:code", verifyToken, isPlatformOwner, deleteKey);

module.exports = router;
