const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const VerificationToken = require("../models/VerificationToken");
const CustomerAccount = require("../models/CustomerAccount");
const AccountVerificationToken = require("../models/AccountVerificationToken");
const BusinessOwnerAccount = require("../models/BusinessOwnerAccount");
const OwnerVerificationToken = require("../models/OwnerVerificationToken");
const Voucher = require("../models/Voucher");
const Subscription = require("../models/Subscription");
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

// DEV/TEST ONLY. Same idea as /mint-global-token but for the global
// BusinessOwnerAccount identity.
router.post("/mint-owner-token", async (req, res, next) => {
  try {
    const { email, type } = req.body;
    const account = await BusinessOwnerAccount.findOne({ email: String(email || "").toLowerCase() });
    if (!account) return res.status(404).json({ success: false });

    const raw = crypto.randomBytes(32).toString("hex");
    await OwnerVerificationToken.create({
      ownerAccountId: account._id,
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

// DEV/TEST ONLY. Force a voucher's expiresAt into the past so a test can
// deterministically exercise the "redeem an expired voucher" path without
// waiting real days or faking the system clock.
router.post("/expire-voucher", async (req, res, next) => {
  try {
    const { voucherCode } = req.body;
    const normalizedCode = String(voucherCode || "").trim().toUpperCase();

    const voucher = await Voucher.findOneAndUpdate(
      { voucherCode: normalizedCode },
      { $set: { expiresAt: new Date(Date.now() - 3600 * 1000) } },
      { new: true }
    );

    if (!voucher) return res.status(404).json({ success: false });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Force a subscription's currentPeriodEnd into the past (by
// `daysAgo`, default putting it just past the grace window) so a test can
// deterministically exercise expiry/grace without waiting real days.
// Mirrors /expire-voucher exactly.
router.post("/expire-subscription", async (req, res, next) => {
  try {
    const { ownerAccountId, daysAgo } = req.body;
    const offsetMs = (Number(daysAgo) || 10) * 24 * 60 * 60 * 1000;

    const subscription = await Subscription.findOneAndUpdate(
      { ownerAccountId },
      { $set: { currentPeriodEnd: new Date(Date.now() - offsetMs) } },
      { new: true }
    );

    if (!subscription) return res.status(404).json({ success: false });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
