const express = require("express");
const { getImage } = require("../controllers/imageController");

const router = express.Router();

// Public, unauthenticated, and deliberately NOT behind resolveTenant — an
// <img> tag sends neither an Authorization header nor tenant slug headers.
router.get("/:id", getImage);

module.exports = router;
