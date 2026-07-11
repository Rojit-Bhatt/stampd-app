const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const StampCard = require("../models/StampCard");
const { generateAuthToken } = require("../utils/tokenUtils");

const SALT_ROUNDS = 10;

const normalizeEmail = (email) => email.trim().toLowerCase();

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureUserStampCard = async (userId) => {
  await StampCard.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
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
    role: user.role
  });

  return {
    success: true,
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      role: user.role
    }
  };
};

const registerUser = async ({ name, email, password }) => {
  if (!name || !email || !password) {
    throw createHttpError("Name, email, and password are required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    throw createHttpError("Email is already registered.", 409);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const createdUser = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword
  });

  await ensureUserStampCard(createdUser._id);

  return {
    success: true,
    message: "User registered successfully."
  };
};

const loginUser = async ({ email, password }) => {
  if (!email || !password) {
    throw createHttpError("Email and password are required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });

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

const authenticateWithGoogle = async ({ idToken }) => {
  if (!idToken) {
    throw createHttpError("Google idToken is required.", 400);
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

  if (!payload || !payload.sub || !payload.email || !payload.name) {
    throw createHttpError("Invalid Google token payload.", 401);
  }

  const googleId = payload.sub;
  const email = normalizeEmail(payload.email);
  const name = payload.name.trim();

  let user = await User.findOne({
    $or: [{ googleId }, { email }]
  });

  if (!user) {
    user = await User.create({
      name,
      email,
      googleId,
      role: "customer"
    });

    await ensureUserStampCard(user._id);
    return formatAuthPayload(user);
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

  await ensureUserStampCard(user._id);

  return formatAuthPayload(user);
};

module.exports = {
  registerUser,
  loginUser,
  authenticateWithGoogle
};
