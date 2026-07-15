const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const VerificationToken = require("../models/VerificationToken");
const CustomerAccount = require("../models/CustomerAccount");
const AccountVerificationToken = require("../models/AccountVerificationToken");
const { resolveTenant } = require("../middleware/tenantMiddleware");

const router = express.Router();

// DEV/TEST ONLY. Mints a raw verification/reset token for an email so
// self-contained tests can drive the email-verify / password-reset flow
// without reading email. Mounted only when MONGODB_URI is unset (mock DB),
// never in production (see server.js guard).
router.post("/mint-token", resolveTenant, async (req, res, next) => {
  try {
    const { email, type } = req.body;
    const user = await User.findOne({
      organizationId: req.organizationId,
      email: String(email || "").toLowerCase()
    });
    if (!user) return res.status(404).json({ success: false });

    const raw = crypto.randomBytes(32).toString("hex");
    await VerificationToken.create({
      organizationId: req.organizationId,
      userId: user._id,
      type,
      tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      usedAt: null
    });
    res.json({ success: true, token: raw });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Same idea as /mint-token but for the global CustomerAccount
// identity — no tenant needed at all.
router.post("/mint-global-token", async (req, res, next) => {
  try {
    const { email, type } = req.body;
    const account = await CustomerAccount.findOne({ email: String(email || "").toLowerCase() });
    if (!account) return res.status(404).json({ success: false });

    const raw = crypto.randomBytes(32).toString("hex");
    await AccountVerificationToken.create({
      customerAccountId: account._id,
      type,
      tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      usedAt: null
    });
    res.json({ success: true, token: raw });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
