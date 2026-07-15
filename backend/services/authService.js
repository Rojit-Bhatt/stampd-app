const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const StampCard = require("../models/StampCard");
const VerificationToken = require("../models/VerificationToken");
const { generateAuthToken } = require("../utils/tokenUtils");
const { sendEmail, buildAuthLink } = require("./emailService");

const SALT_ROUNDS = 10;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const issueToken = async (user, type, organizationId) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const ttl = type === "email_verify" ? VERIFY_TTL_MS : RESET_TTL_MS;
  await VerificationToken.create({
    organizationId,
    userId: user._id,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttl),
    usedAt: null
  });
  return raw;
};

const sendVerifyEmail = async (user, organizationId, slug) => {
  const raw = await issueToken(user, "email_verify", organizationId);
  const link = buildAuthLink({ slug, path: "verify-email", token: raw });
  await sendEmail({
    to: user.email,
    subject: "Verify your email",
    html: `<p>Confirm your email to activate your account:</p><p><a href="${link}">${link}</a></p>`
  });
};

const normalizeEmail = (email) => email.trim().toLowerCase();

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureUserStampCard = async (userId, organizationId) => {
  await StampCard.findOneAndUpdate(
    { userId, organizationId },
    {
      $setOnInsert: {
        userId,
        organizationId,
        stampsEarned: 0,
        lastStampedAt: null
      }
    },
    { upsert: true, new: true }
  );
};

const formatAuthPayload = (user) => {
  const token = generateAuthToken({
    userId: user._id.toString(),
    role: user.role,
    organizationId: user.organizationId ? user.organizationId.toString() : null
  });

  return {
    success: true,
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified
    }
  };
};

const registerUser = async ({ name, email, password, phone, address, organizationId, slug }) => {
  if (!name || !email || !password) {
    throw createHttpError("Name, email, and password are required.", 400);
  }
  if (!phone || !phone.trim()) {
    throw createHttpError("Phone number is required.", 400);
  }
  if (!organizationId) {
    throw createHttpError("A business context is required to register.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await User.findOne({ organizationId, email: normalizedEmail });
  if (existingUser) {
    throw createHttpError("Email is already registered.", 409);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const createdUser = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone.trim(),
    address: (address || "").trim(),
    organizationId,
    role: "customer",
    emailVerified: false
  });

  await ensureUserStampCard(createdUser._id, organizationId);
  await sendVerifyEmail(createdUser, organizationId, slug);

  return { success: true, message: "Registered. Check your email to verify your account." };
};

const loginUser = async ({ email, password, organizationId }) => {
  if (!email || !password) {
    throw createHttpError("Email and password are required.", 400);
  }

  if (!organizationId) {
    throw createHttpError("A business context is required to log in.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ organizationId, email: normalizedEmail });

  if (!user) {
    throw createHttpError("Invalid email or password.", 401);
  }

  if (!user.password) {
    throw createHttpError("Invalid email or password.", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw createHttpError("Invalid email or password.", 401);
  }

  return formatAuthPayload(user);
};

const verifyEmail = async ({ token, organizationId }) => {
  if (!token) throw createHttpError("Verification token is required.", 400);

  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type: "email_verify",
    usedAt: null
  });
  if (!record || record.organizationId.toString() !== organizationId) {
    throw createHttpError("This verification link is invalid or has already been used.", 400);
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This verification link has expired.", 400);
  }

  const user = await User.findOne({ _id: record.userId, organizationId });
  if (!user) throw createHttpError("Account not found.", 404);

  user.emailVerified = true;
  await user.save();
  record.usedAt = new Date();
  await record.save();

  return { success: true, message: "Email verified. You can now collect stamps." };
};

const resendVerification = async ({ email, organizationId, slug }) => {
  if (email && organizationId) {
    const user = await User.findOne({ organizationId, email: normalizeEmail(email) });
    if (user && !user.emailVerified) {
      await sendVerifyEmail(user, organizationId, slug);
    }
  }
  // Never reveal whether the email exists.
  return { success: true, message: "If that account exists and is unverified, a new link was sent." };
};

const authenticateWithGoogle = async ({ idToken, organizationId }) => {
  if (!idToken) {
    throw createHttpError("Google idToken is required.", 400);
  }

  if (!organizationId) {
    throw createHttpError("A business context is required to sign in.", 400);
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    throw createHttpError("GOOGLE_CLIENT_ID is not defined in environment variables.", 500);
  }

  const oauthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  let payload;
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch (_error) {
    throw createHttpError("Invalid Google token.", 401);
  }

  if (!payload || !payload.sub || !payload.email || !payload.name || payload.email_verified !== true) {
    throw createHttpError("Invalid Google token payload.", 401);
  }

  const googleId = payload.sub;
  const email = normalizeEmail(payload.email);
  const name = payload.name.trim();

  let user = await User.findOne({
    organizationId,
    $or: [{ googleId }, { email }]
  });

  if (!user) {
    user = await User.create({
      name,
      email,
      googleId,
      organizationId,
      role: "customer",
      emailVerified: true
    });

    await ensureUserStampCard(user._id, organizationId);
    const payloadOut = formatAuthPayload(user);
    payloadOut.needsPhone = !user.phone;
    return payloadOut;
  }

  if (user.googleId && user.googleId !== googleId) {
    throw createHttpError("Google account mismatch for this user.", 409);
  }

  let shouldSave = false;

  if (!user.googleId) {
    user.googleId = googleId;
    shouldSave = true;
  }

  if (!user.name && name) {
    user.name = name;
    shouldSave = true;
  }

  if (shouldSave) {
    await user.save();
  }

  await ensureUserStampCard(user._id, organizationId);

  const payloadOut = formatAuthPayload(user);
  payloadOut.needsPhone = !user.phone;
  return payloadOut;
};

const completeProfile = async ({ userId, organizationId, phone, address }) => {
  if (!phone || !phone.trim()) throw createHttpError("Phone number is required.", 400);
  const user = await User.findOne({ _id: userId, organizationId });
  if (!user) throw createHttpError("Account not found.", 404);
  user.phone = phone.trim();
  if (address !== undefined) user.address = (address || "").trim();
  await user.save();
  return formatAuthPayload(user);
};

const forgotPassword = async ({ email, organizationId, slug }) => {
  if (email && organizationId) {
    const user = await User.findOne({ organizationId, email: normalizeEmail(email) });
    if (user) {
      const raw = await issueToken(user, "password_reset", organizationId);
      const link = buildAuthLink({ slug, path: "reset-password", token: raw });
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: `<p>Reset your password:</p><p><a href="${link}">${link}</a></p>`
      });
    }
  }
  return { success: true, message: "If that account exists, a reset link was sent." };
};

const resetPassword = async ({ token, password, organizationId }) => {
  if (!token || !password) throw createHttpError("Token and new password are required.", 400);

  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type: "password_reset",
    usedAt: null
  });
  if (!record || record.organizationId.toString() !== organizationId) {
    throw createHttpError("This reset link is invalid or has already been used.", 400);
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This reset link has expired.", 400);
  }

  const user = await User.findOne({ _id: record.userId, organizationId });
  if (!user) throw createHttpError("Account not found.", 404);

  user.password = await bcrypt.hash(password, SALT_ROUNDS);
  await user.save();
  record.usedAt = new Date();
  await record.save();

  return { success: true, message: "Password updated. You can now log in." };
};

module.exports = {
  registerUser,
  loginUser,
  authenticateWithGoogle,
  completeProfile,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  sendVerifyEmail,
  // Reused as-is by customerAccountService (global customer identity) — no
  // behavior change here, just making two already-existing functions
  // importable from outside this file.
  ensureUserStampCard,
  formatAuthPayload
};
