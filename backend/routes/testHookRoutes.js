const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const VerificationToken = require("../models/VerificationToken");
const CustomerAccount = require("../models/CustomerAccount");
const AccountVerificationToken = require("../models/AccountVerificationToken");
const AdminAccount = require("../models/AdminAccount");
const AdminVerificationToken = require("../models/AdminVerificationToken");
const PointsBalance = require("../models/PointsBalance");
const Subscription = require("../models/Subscription");
const PointsTransaction = require("../models/PointsTransaction");
const Organization = require("../models/Organization");
const Company = require("../models/Company");
const MessageLog = require("../models/MessageLog");
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

// DEV/TEST ONLY. Reads back the current live email_verify code for an
// account, so a self-contained test can drive the OTP flow without reading
// email — mirrors /mint-token's role for the link-based flow, but reads
// instead of mints since the code is generated server-side automatically.
router.post("/get-otp-code", async (req, res, next) => {
  try {
    const { email, kind } = req.body;
    const normalizedEmail = String(email || "").toLowerCase();

    if (kind === "admin") {
      const account = await AdminAccount.findOne({ email: normalizedEmail });
      if (!account) return res.status(404).json({ success: false });
      const record = await AdminVerificationToken.findOne({
        adminAccountId: account._id,
        type: "email_verify",
        usedAt: null
      });
      if (!record) return res.status(404).json({ success: false });
      return res.json({ success: true, code: record.code, attempts: record.attempts });
    }

    if (kind === "customer") {
      const account = await CustomerAccount.findOne({ email: normalizedEmail });
      if (!account) return res.status(404).json({ success: false });
      const record = await AccountVerificationToken.findOne({
        customerAccountId: account._id,
        type: "email_verify",
        usedAt: null
      });
      if (!record) return res.status(404).json({ success: false });
      return res.json({ success: true, code: record.code, attempts: record.attempts });
    }

    res.status(400).json({ success: false, message: "kind must be \"admin\" or \"customer\"." });
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

// DEV/TEST ONLY. Same idea as /mint-global-token but for a staff
// AdminAccount (company owner or outlet admin).
router.post("/mint-admin-token", async (req, res, next) => {
  try {
    const { email, type } = req.body;
    const account = await AdminAccount.findOne({ email: String(email || "").toLowerCase() });
    if (!account) return res.status(404).json({ success: false });

    const raw = crypto.randomBytes(32).toString("hex");
    await AdminVerificationToken.create({
      adminAccountId: account._id,
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

// DEV/TEST ONLY. Age a points balance by `daysAgo` so a test can exercise
// expiry without waiting real days or faking the system clock.
//
// Moves BOTH the last activity and the stored deadline back by the same
// amount — which is exactly what the passage of time would have done. The
// deadline is what `isExpiredNow` actually reads, so a hook that only moved
// lastActivityAt would age a field the code no longer consults and prove
// nothing. Nothing on the production path is stubbed: the row ends up in the
// state a genuinely idle customer's row would be in.
router.post("/expire-points", async (req, res, next) => {
  try {
    const { email, organizationId, daysAgo } = req.body;
    // Explicitly not `Number(daysAgo) || 400`: daysAgo: 0 means "reset the
    // clock to now", and `||` would silently turn that into 400 days ago —
    // the exact opposite.
    const days = Number.isFinite(Number(daysAgo)) ? Number(daysAgo) : 400;
    const offsetMs = days * 24 * 60 * 60 * 1000;

    const user = await User.findOne({
      organizationId,
      email: String(email || "").toLowerCase(),
      role: "customer"
    });
    if (!user) return res.status(404).json({ success: false });

    const existing = await PointsBalance.findOne({ organizationId, userId: user._id });
    if (!existing) return res.status(404).json({ success: false });

    const shift = (d) => (d ? new Date(new Date(d).getTime() - offsetMs) : d);

    const balance = await PointsBalance.findOneAndUpdate(
      { organizationId, userId: user._id },
      {
        $set: {
          lastActivityAt: new Date(Date.now() - offsetMs),
          expiresAt: shift(existing.expiresAt)
        }
      },
      { new: true }
    );

    if (!balance) return res.status(404).json({ success: false });

    res.json({ success: true, expiresAt: balance.expiresAt });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Force a subscription's currentPeriodEnd into the past (by
// `daysAgo`, default putting it just past the grace window) so a test can
// deterministically exercise expiry/grace without waiting real days.
// Mirrors /expire-points exactly.
router.post("/expire-subscription", async (req, res, next) => {
  try {
    const { companyId, daysAgo } = req.body;
    const offsetMs = (Number(daysAgo) || 10) * 24 * 60 * 60 * 1000;

    const subscription = await Subscription.findOneAndUpdate(
      { companyId },
      { $set: { currentPeriodEnd: new Date(Date.now() - offsetMs) } },
      { new: true }
    );

    if (!subscription) return res.status(404).json({ success: false });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/create-test-transaction", async (req, res, next) => {
  try {
    const { email, organizationId } = req.body;
    const user = await User.findOne({
      organizationId,
      email: String(email || "").toLowerCase(),
      role: "customer"
    });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const tx = await PointsTransaction.create({
      organizationId,
      userId: user._id,
      type: "earn",
      pointsCenti: 1000,
      balanceAfterCenti: 1000,
      billAmount: 10,
      earnPercent: 10
    });

    res.json({ success: true, tx });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Get organization by company slug and outlet slug, for tests
// that need to directly manipulate organization config.
router.post("/get-organization", async (req, res, next) => {
  try {
    const { companySlug, outletSlug } = req.body;
    const company = await Company.findOne({ slug: String(companySlug || "").toLowerCase() });
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });

    const org = await Organization.findOne({ companyId: company._id, slug: String(outletSlug || "").toLowerCase() });
    if (!org) return res.status(404).json({ success: false, message: "Organization not found" });

    res.json({ success: true, organizationId: org._id.toString() });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Update tier thresholds on an organization.
router.post("/set-tier-thresholds", async (req, res, next) => {
  try {
    const { organizationId, tierThresholds } = req.body;
    const org = await Organization.findOneAndUpdate(
      { _id: organizationId },
      { $set: { tierThresholds } },
      { new: true }
    );
    if (!org) return res.status(404).json({ success: false, message: "Organization not found" });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Create a test transaction with a specific date (for testing
// rolling windows that exclude old data).
router.post("/create-dated-transaction", async (req, res, next) => {
  try {
    const { email, organizationId, billAmount, createdAtDaysAgo } = req.body;
    const user = await User.findOne({
      organizationId,
      email: String(email || "").toLowerCase(),
      role: "customer"
    });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const createdAt = new Date(Date.now() - (createdAtDaysAgo || 0) * 24 * 60 * 60 * 1000);
    const tx = await PointsTransaction.create({
      organizationId,
      userId: user._id,
      type: "earn",
      pointsCenti: 100000,
      billAmount: billAmount || 1000,
      earnPercent: 100,
      createdAt
    });

    res.json({ success: true, tx });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Call resolveTier for testing tier resolution.
router.post("/resolve-tier", async (req, res, next) => {
  try {
    const { organizationId, userId } = req.body;
    const { resolveTier } = require("../services/tierService");
    const tier = await resolveTier(organizationId, userId);
    res.json({ success: true, tier });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Call sendTrigger directly for testing the consent gate and
// template rendering, decoupled from the real milestone/cron trigger paths.
router.post("/send-trigger", async (req, res, next) => {
  try {
    const { organizationId, userId, type, context } = req.body;
    const { sendTrigger } = require("../services/messagingService");

    const membership = await User.findOne({ _id: userId, organizationId });
    if (!membership) return res.status(404).json({ success: false, message: "Membership not found." });
    if (!membership.customerAccountId) return res.status(404).json({ success: false, message: "No linked CustomerAccount." });

    const customer = await CustomerAccount.findOne({ _id: membership.customerAccountId });
    if (!customer) return res.status(404).json({ success: false, message: "CustomerAccount not found." });

    const organization = await Organization.findOne({ _id: organizationId });
    if (!organization) return res.status(404).json({ success: false, message: "Organization not found." });

    const result = await sendTrigger(type, { organization, customer, membership, context });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Read back MessageLog rows for idempotency assertions.
router.post("/message-log-count", async (req, res, next) => {
  try {
    const { organizationId, userId, triggerType } = req.body;

    const count = await MessageLog.countDocuments({ organizationId, userId, triggerType });
    res.status(200).json({ success: true, count });
  } catch (error) {
    next(error);
  }
});

router.post("/run-daily-triggers", async (req, res, next) => {
  try {
    const { runDailyTriggers } = require("../services/messagingService");
    await runDailyTriggers();
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/backdate-balance", async (req, res, next) => {
  try {
    const { organizationId, userId, days } = req.body;

    const balance = await PointsBalance.findOne({ userId, organizationId });
    if (!balance) return res.status(404).json({ success: false, message: "Test balance not found." });

    balance.lastActivityAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await balance.save();

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/create-push-subscription", async (req, res, next) => {
  try {
    const { customerAccountId, endpoint, keys, grantConsent } = req.body;
    const PushSubscription = require("../models/PushSubscription");

    await PushSubscription.create({ customerAccountId, endpoint, keys });

    if (grantConsent) {
      const account = await CustomerAccount.findOne({ _id: customerAccountId });
      account.marketingConsent.push = { granted: true, updatedAt: new Date() };
      await account.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/push-subscription-count", async (req, res, next) => {
  try {
    const PushSubscription = require("../models/PushSubscription");
    const count = await PushSubscription.countDocuments({ customerAccountId: req.query.customerAccountId });
    res.status(200).json({ success: true, count });
  } catch (error) {
    next(error);
  }
});

router.post("/stub-webpush-behavior", async (req, res, next) => {
  try {
    const webpush = require("web-push");
    const { behavior } = req.body;
    webpush.sendNotification = async () => {
      if (behavior === "gone") {
        const err = new Error("Subscription gone");
        err.statusCode = 410;
        throw err;
      }
      return { statusCode: 201 };
    };
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Get a company's id by slug, for tests that need to
// directly configure company-level settings (e.g. the SMS cap).
router.post("/get-company", async (req, res, next) => {
  try {
    const { companySlug } = req.body;
    const company = await Company.findOne({ slug: String(companySlug || "").toLowerCase() });
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });
    res.json({ success: true, companyId: company._id.toString() });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Set (or clear, with null) a company's SMS monthly cap.
router.post("/set-sms-cap", async (req, res, next) => {
  try {
    const { companyId, smsMonthlyCapPaisa } = req.body;
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { $set: { smsMonthlyCapPaisa } },
      { new: true }
    );
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Call smsService.sendSms directly, decoupled from the
// trigger/broadcast callers, for cap/enablement assertions.
router.post("/send-sms", async (req, res, next) => {
  try {
    const { companyId, organizationId, to, text } = req.body;
    const { sendSms } = require("../services/smsService");
    const result = await sendSms({ companyId, organizationId, to, text });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Read back this-calendar-month SmsSendLog count for a
// company, for cap assertions.
router.get("/sms-send-log-count", async (req, res, next) => {
  try {
    const SmsSendLog = require("../models/SmsSendLog");
    const count = await SmsSendLog.countDocuments({ companyId: req.query.companyId });
    res.status(200).json({ success: true, count });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Set an existing AdminAccount's staffRole directly, so a
// suite can exercise the permission matrix without first standing up the
// whole invite flow. The real path is POST /api/admin/staff.
router.post("/set-staff-role", async (req, res, next) => {
  try {
    const { email, staffRole } = req.body;
    const account = await AdminAccount.findOne({ email: String(email || "").toLowerCase() });
    if (!account) return res.status(404).json({ success: false });
    account.staffRole = staffRole || null;
    await account.save();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Hash and set a staff PIN directly on an admin's outlet
// membership, so a suite can exercise verify-pin before the real
// PATCH /api/admin/staff/:id/pin endpoint exists (Task 5). The real path
// goes through staffService.hashPin at the same SALT_ROUNDS.
router.post("/set-staff-pin", async (req, res, next) => {
  try {
    const bcrypt = require("bcryptjs");
    const { email, pin } = req.body;
    const account = await AdminAccount.findOne({ email: String(email || "").toLowerCase() });
    if (!account) return res.status(404).json({ success: false });
    const membership = await User.findOne({ organizationId: account.organizationId, adminAccountId: account._id });
    if (!membership) return res.status(404).json({ success: false });
    membership.staffPinHash = await bcrypt.hash(String(pin), 10);
    await membership.save();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
