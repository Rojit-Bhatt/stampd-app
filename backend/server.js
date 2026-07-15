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
const bcrypt = require("bcryptjs");
const connectDB = require("./config/db");
const { PLATFORM_NAME } = require("./config/platform");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const stampRoutes = require("./routes/stampRoutes");
const voucherRoutes = require("./routes/voucherRoutes");
const reviewsRoutes = require("./routes/reviewsRoutes");
const platformRoutes = require("./routes/platformRoutes");
const tenantRoutes = require("./routes/tenantRoutes");
const menuRoutes = require("./routes/menuRoutes");
const accountRoutes = require("./routes/accountRoutes");
const customerAccountRoutes = require("./routes/customerAccountRoutes");
const claimRoutes = require("./routes/claimRoutes");

const app = express();
const PORT = process.env.PORT || 5001;

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
// Business-admin console (QR, redemption, customers, settings, menu CRUD).
app.use("/api/admin", adminRoutes);
// Customer loyalty (stamps + vouchers), tenant taken from the JWT.
app.use("/api/stamps", stampRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/reviews", reviewsRoutes);

// Dev/test-only helper endpoints, mounted only against the in-memory mock DB
// (mock DB only). Never available against a real database / in production.
if (USING_MOCK_DB) {
  app.use("/__test__", require("./routes/testHookRoutes"));
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
    message: error.message || "Internal Server Error"
  });
});

// Seed a platform admin plus one demo tenant (Coffesarowar) with its business
// admin and a demo customer, so the app is usable immediately in development.
const seedDemoData = async () => {
  const User = require("./models/User");
  const Organization = require("./models/Organization");
  const StampCard = require("./models/StampCard");

  try {
    // 1. Platform super-admin (no tenant).
    const platformEmail = "admin@stampd.co";
    let platformAdmin = await User.findOne({ email: platformEmail, role: "platform" });
    if (!platformAdmin) {
      platformAdmin = await User.create({
        organizationId: null,
        name: `${PLATFORM_NAME} Admin`,
        email: platformEmail,
        password: await bcrypt.hash("password", 10),
        role: "platform",
        emailVerified: true
      });
      console.log(`[seed] Platform admin: ${platformEmail} / password`);
    }

    // 2. Demo tenant "Coffesarowar".
    const slug = "coffesarowar";
    let org = await Organization.findOne({ slug });
    if (!org) {
      org = await Organization.create({
        slug,
        name: "Coffesarowar",
        createdBy: platformAdmin._id,
        branding: {
          tagline: "Every cup earns you closer to a free one.",
          logoUrl: "",
          bannerUrl: "",
          primaryColor: "#7c3f1d"
        }
        // program is filled from schema defaults (5 stamps → Free Coffee, 18h).
      });
      console.log(`[seed] Tenant: ${org.name} (/${slug})`);
    }

    // 3. Business admin (barista) for the demo tenant.
    const adminEmail = "barista@mansarowar.cafe";
    let businessAdmin = await User.findOne({ organizationId: org._id, email: adminEmail });
    if (!businessAdmin) {
      businessAdmin = await User.create({
        organizationId: org._id,
        name: "Coffesarowar Barista",
        email: adminEmail,
        password: await bcrypt.hash("password", 10),
        role: "business_admin",
        emailVerified: true
      });
      console.log(`[seed] Business admin: ${adminEmail} / password (tenant ${slug})`);
    }

    // 4. Demo customer for the demo tenant, pre-loaded with a couple of stamps.
    const customerEmail = "customer@mansarowar.cafe";
    let customer = await User.findOne({ organizationId: org._id, email: customerEmail });
    if (!customer) {
      customer = await User.create({
        organizationId: org._id,
        name: "Regular Customer",
        email: customerEmail,
        password: await bcrypt.hash("password", 10),
        role: "customer",
        phone: "+9779800000000",
        emailVerified: true
      });
      await StampCard.create({
        organizationId: org._id,
        userId: customer._id,
        stampsEarned: 2,
        lastStampedAt: null
      });
      console.log(`[seed] Customer: ${customerEmail} / password (tenant ${slug})`);
    }
  } catch (err) {
    console.error("Failed to seed demo data:", err);
  }
};

const startServer = async () => {
  await connectDB();
  await seedDemoData();

  app.listen(PORT, () => {
    console.log(`${PLATFORM_NAME} server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error(`Server startup error: ${error.message}`);
  process.exit(1);
});

module.exports = app;
