require("dotenv").config();

// Ensure safe fallback for MONGODB_URI and JWT_SECRET
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "super_secret_cafe_token_key_12345_fallback";
}

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = "mongodb://in-memory-fallback";
  console.warn("[AI Studio] MONGODB_URI is not defined. Enabling in-memory MongoDB/Mongoose fallback.");
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

console.log("JWT_SECRET loaded:", !!process.env.JWT_SECRET);
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const stampRoutes = require("./routes/stampRoutes");
const voucherRoutes = require("./routes/voucherRoutes");
const reviewsRoutes = require("./routes/reviewsRoutes");

const app = express();
const PORT = 5001;
const ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];


app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Cafe Loyalty API is running."
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/stamps", stampRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/reviews", reviewsRoutes);

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

const startServer = async () => {
  await connectDB();

  // Seed demo users if they don't exist
  try {
    const User = require("./models/User");
    const bcrypt = require("bcryptjs");
    
    // Check if demo admin (barista) exists
    const adminEmail = "barista@mansarowar.cafe";
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      const hashedPassword = await bcrypt.hash("password", 10);
      admin = await User.create({
        name: "Mansarowar Barista",
        email: adminEmail,
        password: hashedPassword,
        role: "admin"
      });
      console.log(`[AI Studio Seed] Created demo admin: ${adminEmail}`);
    }
    
    // Check if demo customer exists
    const customerEmail = "customer@mansarowar.cafe";
    let customer = await User.findOne({ email: customerEmail });
    if (!customer) {
      const hashedPassword = await bcrypt.hash("password", 10);
      customer = await User.create({
        name: "Regular Customer",
        email: customerEmail,
        password: hashedPassword,
        role: "customer"
      });
      // Ensure they have a StampCard
      const StampCard = require("./models/StampCard");
      await StampCard.create({
        userId: customer._id,
        stampsEarned: 2, // start with 2 stamps so the user can see it in action!
        lastStampedAt: null
      });
      console.log(`[AI Studio Seed] Created demo customer: ${customerEmail}`);
    }
  } catch (err) {
    console.error("Failed to seed demo users:", err);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error(`Server startup error: ${error.message}`);
  process.exit(1);
});
