require("dotenv").config();

// In production the secret MUST come from the environment. In development we
// fall back to an insecure dev key (also handled in utils/tokenUtils.js) so the
// app runs with zero configuration.
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET must be set in production.");
    process.exit(1);
  }
  process.env.JWT_SECRET = "dev_only_insecure_jwt_secret_change_me";
  console.warn("[dev] JWT_SECRET not set — using an insecure development key.");
}

// True when running against the in-memory mock DB (no real MONGODB_URI given).
// Set before the fallback URI is assigned below, so later code can tell dev/mock
// mode apart from a real connection.
const USING_MOCK_DB = !process.env.MONGODB_URI;

// Same fatal-in-production pattern as JWT_SECRET above. Without this, a
// production deploy with a missing/typo'd MONGODB_URI wouldn't crash — it
// would silently fall back to the in-memory mock DB and (further below) mount
// the unauthenticated /__test__ routes, which include an endpoint that mints
// a valid session token for any email address. A misconfigured prod deploy
// must fail loudly here, not hand out an account-takeover primitive.
if (USING_MOCK_DB && process.env.NODE_ENV === "production") {
  console.error("FATAL: MONGODB_URI must be set in production.");
  process.exit(1);
}

if (USING_MOCK_DB) {
  process.env.MONGODB_URI = "mongodb://in-memory-fallback";
  console.warn("[dev] MONGODB_URI is not defined. Enabling in-memory MongoDB/Mongoose fallback.");
  const Module = require("module");
  const originalRequire = Module.prototype.require;
  const path = require("path");
  Module.prototype.require = function (id) {
    if (id === "mongoose") {
      return originalRequire.call(this, path.resolve(__dirname, "./utils/mockMongoose"));
    }
    return originalRequire.apply(this, arguments);
  };
}

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const { PLATFORM_NAME, PLATFORM_TIMEZONE } = require("./config/platform");
const cron = require("node-cron");
const { runDailyTriggers } = require("./services/messagingService");
const { seedDemoData, ensurePlatformAdmin, cleanupDemoData } = require("./seed/demoSeed");
const { ensureDefaultPlansSeeded } = require("./services/subscriptionPlanService");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const pointsRoutes = require("./routes/pointsRoutes");
const reviewsRoutes = require("./routes/reviewsRoutes");
const imageRoutes = require("./routes/imageRoutes");
const platformRoutes = require("./routes/platformRoutes");
const tenantRoutes = require("./routes/tenantRoutes");
const menuRoutes = require("./routes/menuRoutes");
const accountRoutes = require("./routes/accountRoutes");
const customerAccountRoutes = require("./routes/customerAccountRoutes");
const claimRoutes = require("./routes/claimRoutes");
const subscriptionPlanRoutes = require("./routes/subscriptionPlanRoutes");
const subscriptionKeyRoutes = require("./routes/subscriptionKeyRoutes");
const companyRoutes = require("./routes/companyRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const toolsRoutes = require("./routes/toolsRoutes");

const app = express();
const PORT = process.env.PORT || (process.env.NODE_ENV === "production" ? 3000 : 5001);

// In production the app runs behind Render's proxy, so the real client IP is
// in X-Forwarded-For, not the socket. Trust exactly one hop so req.ip (and
// the rate limiter that keys on it) sees the actual client rather than the
// proxy — otherwise every request would share one IP and get throttled
// together. Left off in dev/test (direct connections), which is also what
// lets a single test process trip a rate-limit threshold on purpose.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Configurable via FRONTEND_ORIGINS (comma-separated) in production.
const ALLOWED_ORIGINS = (
  process.env.FRONTEND_ORIGINS ||
  "http://localhost:5173,http://localhost:5174,http://localhost:3000,http://localhost:3001"
).split(",").map((o) => o.trim());

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: `${PLATFORM_NAME} loyalty platform API is running.`
  });
});

// Platform super-admin (onboards + manages businesses/tenants).
app.use("/api/platform", platformRoutes);
// Subscription plan CRUD (platform-admin-configurable) + public pricing read.
app.use("/api/platform/plans", subscriptionPlanRoutes);
// Manually-issued activation keys (no live payment gateway — see
// docs/superpowers/plans/2026-07-16-multi-business-subscriptions.md).
app.use("/api/platform/subscription-keys", subscriptionKeyRoutes);
// Public tenant info (branding + program) resolved from the tenant slug.
app.use("/api/tenant", tenantRoutes);
// Public display-only menu for a tenant.
app.use("/api/menu", menuRoutes);
// Tenant-scoped auth (customers + business admins log in per tenant).
app.use("/api/auth", authRoutes);
// Shared account actions (profile edit, password change) for any authenticated role.
app.use("/api/account", accountRoutes);
// Global customer identity (register/login/google/verify shared across every
// tenant) + enter-tenant, the exchange for a normal tenant JWT.
app.use("/api/customer-auth", customerAccountRoutes);
// QR-as-link claim lifecycle: start (converts a scanned QR token into a
// longer-lived pending claim), status (polling), fulfill (the actual stamp
// award, tenant-JWT gated).
app.use("/api/claim", claimRoutes);
// The unified, slug-less staff login. One email+password form for company
// owners and outlet admins alike — the credentials decide which.
app.use("/api/admin-auth", adminAuthRoutes);
// The company owner's console: its outlets, its subscription, its
// cross-outlet rollup. Company-owner session only.
app.use("/api/company", companyRoutes);
// Business-admin console (QR, redemption, customers, settings, menu CRUD).
app.use("/api/admin", adminRoutes);
// Customer loyalty (earn, redeem, balance, history), tenant from the JWT.
app.use("/api/points", pointsRoutes);
app.use("/api/reviews", reviewsRoutes);
// Public marketing-site tools (e.g. the Google Places autocomplete proxy
// behind the review-QR flyer generator). No tenant, no auth, no database.
app.use("/api/tools", toolsRoutes);
// Public: an <img> tag carries neither an Authorization header nor tenant
// slug headers, so this sits outside resolveTenant deliberately.
app.use("/api/images", imageRoutes);

// Dev/test-only helper endpoints, mounted only against the in-memory mock DB
// (mock DB only). Never available against a real database / in production.
if (USING_MOCK_DB) {
  app.use("/__test__", require("./routes/testHookRoutes"));
}

// Serve frontend static files in production
if (process.env.NODE_ENV === "production") {
  const path = require("path");
  const distPath = path.resolve(__dirname, "../frontend/dist");
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/__test__")) {
      return next();
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((req, _res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: error.message || "Internal Server Error",
    ...(error.code ? { code: error.code } : {})
  });
});

// Opt-out escape hatch for a from-scratch run with none of the demo
// companies/outlets/customers — everything an operator does from here is a
// real POST against a real (if in-memory) database, not a fixture. Still
// needs exactly one platform admin to exist (nothing self-registers a
// platform account) and the real subscription plans (outlet-limit gating
// isn't demo data, it's product config) — both idempotent, so a restart
// against a persistent DB won't recreate what's already there.
const startServer = async () => {
  await connectDB();

  // Sync indexes to ensure MongoDB has the updated partial-filter unique indexes
  try {
    const User = require("./models/User");
    const CustomerAccount = require("./models/CustomerAccount");
    if (typeof User.syncIndexes === "function") {
      await User.syncIndexes();
    }
    if (typeof CustomerAccount.syncIndexes === "function") {
      await CustomerAccount.syncIndexes();
    }
    console.log("[db] Database indexes synchronized successfully.");
  } catch (err) {
    console.warn("[db] Index synchronization warning:", err.message);
  }

  // Only seed demo data if explicitly requested OR if we are running in development with an in-memory mock database.
  // When connected to a real database (like MongoDB Atlas, where USING_MOCK_DB is false), we do NOT automatically
  // seed demo data. This prevents polluting the production database with testing/demo data.
  const shouldSeedDemo = process.env.SEED_DEMO_DATA === "true" || (USING_MOCK_DB && process.env.SEED_DEMO_DATA !== "false");

  if (shouldSeedDemo) {
    await seedDemoData();
  } else {
    // If we are connected to a real database (like MongoDB Atlas) and seeding is disabled,
    // make sure to delete any previous demo seed data so we don't pollute the production database.
    await cleanupDemoData();

    // Seed the essential default plans.
    await ensureDefaultPlansSeeded();
    
    // Create the platform admin if credentials are provided in env.
    if (process.env.PLATFORM_ADMIN_EMAIL && process.env.PLATFORM_ADMIN_PASSWORD) {
      await ensurePlatformAdmin(process.env.PLATFORM_ADMIN_EMAIL, process.env.PLATFORM_ADMIN_PASSWORD);
    } else {
      console.log("[db] No PLATFORM_ADMIN_EMAIL/PASSWORD environment variables set; skipping default platform admin bootstrap.");
    }
  }

  cron.schedule("0 9 * * *", () => {
    runDailyTriggers().catch((err) => console.error("Daily triggers run failed:", err.message));
  }, { timezone: PLATFORM_TIMEZONE });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`${PLATFORM_NAME} server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error(`Server startup error: ${error.message}`);
  process.exit(1);
});

module.exports = app;
