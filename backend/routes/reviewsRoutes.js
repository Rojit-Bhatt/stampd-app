const express = require("express");
const { getGoogleReviews } = require("../controllers/reviewsController");

const router = express.Router();

router.get("/", getGoogleReviews);

module.exports = router;
