const express = require("express");
const {
  login, verifyEmail, resendVerification, forgotPassword, resetPassword
} = require("../controllers/adminAuthController");

const router = express.Router();

// Every route here is deliberately slug-less: an AdminAccount is a global
// staff identity, and the whole point of the unified login is that the
// credentials decide which company/outlet you belong to.
router.post("/login", login);
router.get("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
