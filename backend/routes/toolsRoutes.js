const express = require("express");

const { postPlacesAutocomplete } = require("../controllers/placesController");
const { placesLimiter } = require("../middleware/rateLimitMiddleware");

// Public marketing-site tools. No resolveTenant, no verifyToken, no database:
// nothing here belongs to a tenant, and nothing here writes.
const router = express.Router();

router.post("/places/autocomplete", placesLimiter, postPlacesAutocomplete);

module.exports = router;
