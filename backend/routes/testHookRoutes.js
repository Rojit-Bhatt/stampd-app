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

// DEV/TEST ONLY. Driver-level command monitor for the batch-writes-perf
// benchmark: counts find vs write round trips the server issues, so a
// benchmark can assert the refactored trigger path stays O(1) round trips
// per org instead of one per user. Command monitoring has existed in the
// mongoose driver since 3.x and is cheap enough to leave always-on in the
// mock-DB-only test build.
const mongoose = require("mongoose");
// Round-trip accounting. The real driver emits "commandStarted" events and
// these accumulate there; the dev/test in-memory mock engine never touches
// the driver, so in that build the counters live on the mock connection
// (__mockOpStats, set up by the mock engine). Either way the benchmark
// reads the same two numbers.
const readStats = () => {
  // The dev/test in-memory mock engine exposes its round-trip counters on
  // mongoose itself (__mockOpStats) — `mongoose.connection` is only created
  // once the mock boots, so this falls through to the plain counters when
  // the connection object doesn't exist yet.
  if (mongoose.__mockOpStats) {
    return { ...mongoose.__mockOpStats, mockBuild: true };
  }
  return { findOps: opStats.findOps, writeOps: opStats.writeOps, mockBuild: false };
};
const opStats = { findOps: 0, writeOps: 0 };
try {
  if (mongoose.connection && typeof mongoose.connection.on === "function") {
    mongoose.connection.on("commandStarted", (event) => {
      const cmd = event.commandName || "";
      if (cmd.startsWith("find")) opStats.findOps++;
      else if (/insert|update|delete|replace/.test(cmd)) opStats.writeOps++;
    });
  }
} catch (_) {
  // Monitoring unavailable — the mock engine's own counters take over.
}

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

// DEV/TEST ONLY. Seeds the exact legacy redeem rows the backfill-redeem-values
// suite exercises. Each seedRedeems entry becomes one PointsTransaction doc on
// the given org; `seedItems` entries create MenuItem docs first, and a
// seedRedeems rewardRef of "$itemId:N" resolves to the Nth created item so
// the test can back a legacy row onto a real, queryable menu item. Returns
// the created ids so the suite asserts against the report API instead of the
// in-process DB (the parent process has no shared mock-DB connection).
router.post("/seed-backfill-rows", async (req, res, next) => {
  try {
    const { organizationId, seedItems, seedRedeems, customerEmail } = req.body;
    if (!organizationId || !Array.isArray(seedRedeems)) {
      return res.status(400).json({ success: false, message: "organizationId + seedRedeems required" });
    }
    const MenuItem = require("../models/MenuItem");

    // Every ledger row needs an owning membership (userId) — the report
    // names the customer through it, and the model requires it.
    const user = await User.findOne({
      organizationId,
      email: String(customerEmail || "").toLowerCase(),
      role: "customer"
    });
    if (!user) {
      return res.status(400).json({ success: false, message: "customerEmail not found at this outlet" });
    }

    const createdItems = [];
    for (const item of seedItems || []) {
      const created = await MenuItem.create({ organizationId, ...item });
      createdItems.push({ id: created._id.toString() });
    }

    const ids = [];
    for (const row of seedRedeems) {
      const rewardRef =
        typeof row.rewardRef === "string" && row.rewardRef.startsWith("$itemId:")
          ? createdItems[Number(row.rewardRef.slice(8))].id
          : row.rewardRef;
      const doc = await PointsTransaction.create({
        organizationId,
        userId: user._id,
        type: "redeem",
        pointsCenti: row.pointsCenti,
        balanceAfterCenti: row.balanceAfterCenti,
        rewardKind: row.rewardKind === undefined ? "menu" : row.rewardKind,
        rewardRef,
        rewardName: row.rewardName,
        rewardValueNpr: row.rewardValueNpr === undefined ? null : row.rewardValueNpr,
        token: row.token || `backfill-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        performedByName: "",
        createdAt: new Date(Date.now() - (row.daysBack || 0) * 24 * 60 * 60 * 1000)
      });
      ids.push(doc._id.toString());
    }

    res.json({ success: true, createdItems, createdTransactionIds: ids });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Runs the one-time redeem-value backfill for a single org.
router.post("/run-backfill", async (req, res, next) => {
  try {
    const { organizationId, dryRun } = req.body;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: "organizationId required" });
    }
    const { backfillRedeemValues } = require("../services/backfillRedeemService");
    const result = await backfillRedeemValues(organizationId, { dryRun: Boolean(dryRun) });
    res.json(result);
  } catch (error) {
    console.error("[__test__/run-backfill]", error.stack);
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
    // Emit the full stack to the test harness so a batch-refactor bug shows
    // exactly which find/update blew up instead of a bare message.
    console.error("[__test__/run-daily-triggers]", error.stack);
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
    if (process.env.DEBUG_HOOKS) {
      res.status(500).json({ success: false, message: error.message, stack: error.stack });
    } else {
      next(error);
    }
  }
});

router.post("/stub-webpush-behavior", async (req, res, next) => {
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

// DEV/TEST ONLY. Bulk-seeds customers with a birthday today, email consent,
// and (optionally) an aged balance so runDailyTriggers has real work to do
// at scale. Creates rows directly (models level) — deliberately bypassing
// the registration rate limiter and consent forms, which are covered by
// their own tests; this exists so the batch-writes benchmark can reach
// hundreds of seeded customers in seconds.
router.post("/seed-customers", async (req, res, next) => {
  try {
    const { organizationId, count, birthdayToday, ageBalanceDays, earnEach } = req.body;
    const n = Math.min(Math.max(Number(count) || 0, 0), 2000);
    const org = await Organization.findOne({ _id: organizationId });
    if (!org) return res.status(404).json({ success: false, message: "Organization not found." });

    // One CustomerAccount shared by all seeded memberships is wrong for the
    // trigger paths (per-customer consent + MessageLog per membership), so
    // create N distinct accounts but batch the writes (insertMany, the whole
    // point of this test):
    const CHUNK = 500;
    const CustomerAccountModel = require("../models/CustomerAccount");
    const crypto = require("crypto");

    const accounts = [];
    const now = new Date();
    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();
    for (let i = 0; i < n; i++) {
      accounts.push({
        email: `seed-${organizationId}-${crypto.randomBytes(6).toString("hex")}@test.co`.toLowerCase(),
        name: `SeedCustomer${i}`,
        phone: `981111${String(i).padStart(6, "0")}`,
        password: "hashed",
        birthdayMonth: birthdayToday ? todayMonth : 7,
        birthdayDay: birthdayToday ? todayDay : 4,
        marketingConsent: { email: { granted: true, updatedAt: now }, push: { granted: true, updatedAt: now }, sms: { granted: false } },
        emailVerified: true,
        createdAt: now,
        updatedAt: now
      });
    }
    for (let i = 0; i < accounts.length; i += CHUNK) {
      await CustomerAccountModel.insertMany(accounts.slice(i, i + CHUNK));
    }
    const created = await CustomerAccountModel.find({ name: { $regex: /^SeedCustomer/ } }).limit(n * 2);
    const accountIds = created.map((a) => a._id);

    const users = [];
    for (let i = 0; i < accountIds.length; i++) {
      // Distinct emails per org (index) and a real phone — phone is
      // required for customer rows even when customerAccountId is set,
      // and the mock DB doesn't run validators so seed them outright.
      users.push({
        organizationId,
        customerAccountId: accountIds[i],
        name: "seed",
        email: `seed-${i}@${organizationId}.test.co`,
        phone: `981111${String(i).padStart(6, "0")}`,
        role: "customer",
        emailVerified: true,
        createdAt: now,
        updatedAt: now
      });
    }
    for (let i = 0; i < users.length; i += CHUNK) {
      await User.insertMany(users.slice(i, i + CHUNK));
    }
    const seededUsers = await User.find({ organizationId, role: "customer", customerAccountId: { $in: accountIds } });

    if (earnEach) {
      const balances = seededUsers.map((u) => ({
        organizationId,
        userId: u._id,
        balanceCenti: 1000,
        lastActivityAt: ageBalanceDays ? new Date(Date.now() - ageBalanceDays * 24 * 60 * 60 * 1000) : now,
        expiresAt: null,
        expiredAt: null,
        createdAt: now,
        updatedAt: now
      }));
      for (let i = 0; i < balances.length; i += CHUNK) {
        await PointsBalance.insertMany(balances.slice(i, i + CHUNK));
      }
      const earnTxns = seededUsers.map((u) => ({
        organizationId,
        userId: u._id,
        type: "earn",
        pointsCenti: 1000,
        balanceAfterCenti: 1000,
        billAmount: 10,
        earnPercent: 10,
        createdAt: now
      }));
      for (let i = 0; i < earnTxns.length; i += CHUNK) {
        await PointsTransaction.insertMany(earnTxns.slice(i, i + CHUNK));
      }
    }

    res.json({ success: true, seeded: seededUsers.length });
  } catch (error) {
    next(error);
  }
});

router.get("/db-op-stats", (_req, res) => {
  res.json(readStats());
});
router.post("/reset-db-op-stats", (_req, res) => {
  if (mongoose.__mockResetOps) mongoose.__mockResetOps();
  opStats.findOps = 0;
  opStats.writeOps = 0;
  res.json({ success: true });
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

// DEV/TEST ONLY. Clears an account's password and stamps a googleId, so a
// suite can exercise the "Google-only, no password set" path without a real
// OAuth round-trip. kind: "customer" (CustomerAccount) or "staff" (the
// tenant-scoped User row — the actual password store for role "customer";
// business_admin/platform rows never carry one, see models/User.js). Returns
// the previous hash so the caller can restore it afterwards.
router.post("/clear-password", async (req, res, next) => {
  try {
    const { email, kind } = req.body;
    const normalizedEmail = String(email || "").toLowerCase();
    const Model = kind === "staff" ? User : CustomerAccount;

    const account = await Model.findOne({ email: normalizedEmail });
    if (!account) return res.status(404).json({ success: false });

    const previousPasswordHash = account.password || null;
    account.password = null;
    account.googleId = account.googleId || "test-google-id";
    await account.save();

    res.json({ success: true, previousPasswordHash });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Restores a password hash cleared by /clear-password.
router.post("/restore-password", async (req, res, next) => {
  try {
    const { email, kind, passwordHash } = req.body;
    const normalizedEmail = String(email || "").toLowerCase();
    const Model = kind === "staff" ? User : CustomerAccount;

    const account = await Model.findOne({ email: normalizedEmail });
    if (!account) return res.status(404).json({ success: false });

    account.password = passwordHash;
    await account.save();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
