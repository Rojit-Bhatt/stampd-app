const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const CustomerAccount = require("../models/CustomerAccount");
const AccountVerificationToken = require("../models/AccountVerificationToken");
const User = require("../models/User");
const { ensureUserStampCard, formatAuthPayload } = require("./authService");
const { generateGlobalSessionToken } = require("../utils/tokenUtils");
const { sendEmail } = require("./emailService");

const SALT_ROUNDS = 10;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const APP_BASE_URL = () => process.env.APP_BASE_URL || "http://localhost:3000";

// Global (slug-less) link, e.g. http://localhost:3000/verify-email?token=...
const buildGlobalAuthLink = (path, token) =>
  `${APP_BASE_URL()}/${path}?token=${encodeURIComponent(token)}`;

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const normalizeEmail = (email) => email.trim().toLowerCase();

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const issueToken = async (customerAccountId, type) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const ttl = type === "email_verify" ? VERIFY_TTL_MS : RESET_TTL_MS;
  await AccountVerificationToken.create({
    customerAccountId,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttl),
    usedAt: null
  });
  return raw;
};

const sendVerifyEmail = async (account) => {
  const raw = await issueToken(account._id, "email_verify");
  const link = buildGlobalAuthLink("verify-email", raw);
  await sendEmail({
    to: account.email,
    subject: "Verify your email",
    html: `<p>Confirm your email to activate your account:</p><p><a href="${link}">${link}</a></p>`
  });
};

const formatGlobalSessionPayload = (account) => ({
  success: true,
  token: generateGlobalSessionToken({ customerAccountId: account._id.toString() }),
  account: {
    id: account._id.toString(),
    name: account.name,
    email: account.email,
    emailVerified: account.emailVerified
  }
});

// Finds-or-creates the tenant-scoped User "membership" row for this
// CustomerAccount, re-syncing the denormalized name/phone/emailVerified
// copies on every call. Exported — used by enterTenant here and by
// pendingClaimService.fulfillPendingClaim.
const ensureMembership = async ({ customerAccountId, organizationId, account }) => {
  let user = await User.findOne({ organizationId, customerAccountId });

  if (!user) {
    account = account || (await CustomerAccount.findOne({ _id: customerAccountId }));
    if (!account) throw createHttpError("Account not found.", 404);

    user = await User.create({
      organizationId,
      customerAccountId,
      name: account.name,
      email: account.email,
      phone: account.phone || "",
      address: "",
      role: "customer",
      emailVerified: account.emailVerified
    });

    await ensureUserStampCard(user._id, organizationId);
    return user;
  }

  account = account || (await CustomerAccount.findOne({ _id: customerAccountId }));
  if (account) {
    let dirty = false;
    if (user.name !== account.name) {
      user.name = account.name;
      dirty = true;
    }
    if (user.phone !== (account.phone || "")) {
      user.phone = account.phone || "";
      dirty = true;
    }
    if (user.emailVerified !== account.emailVerified) {
      user.emailVerified = account.emailVerified;
      dirty = true;
    }
    if (dirty) await user.save();
  }

  return user;
};

const registerAccount = async ({ name, email, password, phone }) => {
  if (!name || !email || !password) {
    throw createHttpError("Name, email, and password are required.", 400);
  }
  if (!phone || !phone.trim()) {
    throw createHttpError("Phone number is required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const existing = await CustomerAccount.findOne({ email: normalizedEmail });
  if (existing) {
    throw createHttpError("Email is already registered.", 409);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const account = await CustomerAccount.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone.trim(),
    emailVerified: false
  });

  await sendVerifyEmail(account);

  return { success: true, message: "Registered. Check your email to verify your account.", accountId: account._id.toString() };
};

const loginAccount = async ({ email, password }) => {
  if (!email || !password) {
    throw createHttpError("Email and password are required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const account = await CustomerAccount.findOne({ email: normalizedEmail });

  if (!account || !account.password) {
    throw createHttpError("Invalid email or password.", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, account.password);
  if (!isPasswordValid) {
    throw createHttpError("Invalid email or password.", 401);
  }

  return formatGlobalSessionPayload(account);
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

  if (!payload || !payload.sub || !payload.email || !payload.name || payload.email_verified !== true) {
    throw createHttpError("Invalid Google token payload.", 401);
  }

  const googleId = payload.sub;
  const email = normalizeEmail(payload.email);
  const name = payload.name.trim();

  let account = await CustomerAccount.findOne({ $or: [{ googleId }, { email }] });

  if (!account) {
    account = await CustomerAccount.create({ name, email, googleId, emailVerified: true });
    const out = formatGlobalSessionPayload(account);
    out.needsPhone = !account.phone;
    return out;
  }

  if (account.googleId && account.googleId !== googleId) {
    throw createHttpError("Google account mismatch for this user.", 409);
  }

  let shouldSave = false;
  if (!account.googleId) {
    account.googleId = googleId;
    shouldSave = true;
  }
  if (!account.name && name) {
    account.name = name;
    shouldSave = true;
  }
  if (shouldSave) await account.save();

  const out = formatGlobalSessionPayload(account);
  out.needsPhone = !account.phone;
  return out;
};

const completeProfile = async ({ customerAccountId, phone }) => {
  if (!phone || !phone.trim()) throw createHttpError("Phone number is required.", 400);

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  account.phone = phone.trim();
  await account.save();

  // Propagate to every existing membership row (mock DB has no updateMany —
  // find+save loop, both supported).
  const members = await User.find({ customerAccountId });
  for (const member of members) {
    member.phone = account.phone;
    await member.save();
  }

  return formatGlobalSessionPayload(account);
};

const verifyAccountEmail = async ({ token }) => {
  if (!token) throw createHttpError("Verification token is required.", 400);

  const record = await AccountVerificationToken.findOne({
    tokenHash: hashToken(token),
    type: "email_verify",
    usedAt: null
  });
  if (!record) {
    throw createHttpError("This verification link is invalid or has already been used.", 400);
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This verification link has expired.", 400);
  }

  const account = await CustomerAccount.findOne({ _id: record.customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  account.emailVerified = true;
  await account.save();
  record.usedAt = new Date();
  await record.save();

  const members = await User.find({ customerAccountId: account._id });
  for (const member of members) {
    member.emailVerified = true;
    await member.save();
  }

  // Fulfill any pending stamp claims this account was waiting on, now that
  // it's verified. Required late (avoids a require-cycle since
  // pendingClaimService also needs ensureMembership from this file).
  const { autoFulfillForAccount } = require("./pendingClaimService");
  const fulfilled = await autoFulfillForAccount(account._id.toString());

  return { success: true, message: "Email verified.", fulfilled };
};

const resendVerification = async ({ email }) => {
  if (email) {
    const account = await CustomerAccount.findOne({ email: normalizeEmail(email) });
    if (account && !account.emailVerified) {
      await sendVerifyEmail(account);
    }
  }
  // Never reveal whether the email exists.
  return { success: true, message: "If that account exists and is unverified, a new link was sent." };
};

const forgotPassword = async ({ email }) => {
  if (email) {
    const account = await CustomerAccount.findOne({ email: normalizeEmail(email) });
    if (account) {
      const raw = await issueToken(account._id, "password_reset");
      const link = buildGlobalAuthLink("reset-password", raw);
      await sendEmail({
        to: account.email,
        subject: "Reset your password",
        html: `<p>Reset your password:</p><p><a href="${link}">${link}</a></p>`
      });
    }
  }
  return { success: true, message: "If that account exists, a reset link was sent." };
};

const resetPassword = async ({ token, password }) => {
  if (!token || !password) throw createHttpError("Token and new password are required.", 400);

  const record = await AccountVerificationToken.findOne({
    tokenHash: hashToken(token),
    type: "password_reset",
    usedAt: null
  });
  if (!record) {
    throw createHttpError("This reset link is invalid or has already been used.", 400);
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This reset link has expired.", 400);
  }

  const account = await CustomerAccount.findOne({ _id: record.customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  account.password = await bcrypt.hash(password, SALT_ROUNDS);
  await account.save();
  record.usedAt = new Date();
  await record.save();

  return { success: true, message: "Password updated. You can now log in." };
};

// Exchanges a global session (already verified by verifyGlobalSession
// middleware) for a normal tenant JWT, auto-provisioning the tenant
// membership on first visit. Response shape is byte-identical to today's
// tenant login/register success shape (formatAuthPayload, reused verbatim),
// so CustomerAuthContext.persist() works with zero changes.
const enterTenant = async ({ customerAccountId, organizationId }) => {
  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  const membershipUser = await ensureMembership({ customerAccountId, organizationId, account });
  return formatAuthPayload(membershipUser);
};

module.exports = {
  registerAccount,
  loginAccount,
  authenticateWithGoogle,
  completeProfile,
  verifyAccountEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  enterTenant,
  ensureMembership
};
