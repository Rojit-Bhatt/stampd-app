require("dotenv").config();
console.log("JWT_SECRET loaded:", !!process.env.JWT_SECRET);
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const stampRoutes = require("./routes/stampRoutes");
const voucherRoutes = require("./routes/voucherRoutes");

const app = express();
const PORT = process.env.PORT;
const ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

if (!PORT) {
  throw new Error("PORT is not defined in environment variables.");
}

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
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error(`Server startup error: ${error.message}`);
  process.exit(1);
});
