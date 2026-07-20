const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const CustomerAccount = require("../models/CustomerAccount");
const CustomerAvatar = require("../models/CustomerAvatar");
const AccountVerificationToken = require("../models/AccountVerificationToken");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Company = require("../models/Company");
const PointsBalance = require("../models/PointsBalance");
const { ensureUserPointsBalance, formatAuthPayload } = require("./authService");
const { effectiveBalanceCenti, expiresAtFor } = require("./pointsService");
const { toPoints } = require("../utils/pointsMath");
const { generateGlobalSessionToken } = require("../utils/tokenUtils");
const { resolveProgram } = require("./programService");
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

// Token creation stays awaited (fast DB write); the SMTP send is
// fire-and-forget so its latency never blocks the caller's response.
const sendVerifyEmail = async (account) => {
  const raw = await issueToken(account._id, "email_verify");
  const link = buildGlobalAuthLink("verify-email", raw);
  sendEmail({
    to: account.email,
    subject: "Verify your email",
    html: `<p>Confirm your email to activate your account:</p><p><a href="${link}">${link}</a></p>`
  }).catch((err) => console.error(`Failed to email verify-link to ${account.email}:`, err.message));
};

const formatGlobalSessionPayload = (account) => ({
  success: true,
  token: generateGlobalSessionToken({ customerAccountId: account._id.toString() }),
  account: {
    id: account._id.toString(),
    name: account.name,
    email: account.email,
    emailVerified: account.emailVerified,
    avatarVersion: account.avatarVersion || 0
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

    await ensureUserPointsBalance(user._id, organizationId);
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

const registerAccount = async ({ name, email, password, phone, pendingClaimId, claimSecret }) => {
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

  if (pendingClaimId) {
    try {
      // Required late — avoids a require cycle (pendingClaimService needs
      // ensureMembership from this file). Registration succeeding is the
      // important half; an invalid/expired/already-fulfilled claim id here
      // shouldn't fail the signup itself.
      const { linkPendingClaimToAccount } = require("./pendingClaimService");
      await linkPendingClaimToAccount({
        pendingClaimId,
        claimSecret,
        customerAccountId: account._id.toString()
      });
    } catch (_err) {
      // Swallow — see comment above.
    }
  }

  return { success: true, message: "Registered. Check your email to verify your account.", accountId: account._id.toString() };
};

const loginAccount = async ({ email, password }) => {
  if (!email || !password) {
    throw createHttpError("Email and password are required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const account = await CustomerAccount.findOne({ email: normalizedEmail });

  if (!account || !account.password) {
    throw createHttpError("That email or password didn't match — try again.", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, account.password);
  if (!isPasswordValid) {
    throw createHttpError("That email or password didn't match — try again.", 401);
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
  // Google already proved ownership of this mailbox — the payload check above
  // rejects anything with email_verified !== true. Asking the customer to go
  // find our own confirmation email on top of that verifies nothing further,
  // so an account that signs in this way is verified from here on. Matters
  // now that redemption is gated on it: a Google-only customer has no
  // password, and previously an account created BEFORE linking Google could
  // sit permanently unverified with no way to earn its way out.
  if (!account.emailVerified) {
    account.emailVerified = true;
    shouldSave = true;
  }
  if (shouldSave) await account.save();

  // Keep the denormalized copies on every tenant membership in step, the
  // same sync verifyAccountEmail does — outlet-scoped code (redeemPoints)
  // reads emailVerified off the User row, not the account.
  if (account.emailVerified) {
    const members = await User.find({ customerAccountId: account._id });
    for (const member of members) {
      if (!member.emailVerified) {
        member.emailVerified = true;
        await member.save();
      }
    }
  }

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
      sendEmail({
        to: account.email,
        subject: "Reset your password",
        html: `<p>Reset your password:</p><p><a href="${link}">${link}</a></p>`
      }).catch((err) => console.error(`Failed to email reset-link to ${account.email}:`, err.message));
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

// Every business this CustomerAccount already has a membership at, with its
// real per-outlet points balance — powers the "My Businesses" tab. Balances
// are per-outlet and never pool, so this is a list of separate balances, not
// a total.
// User.find({customerAccountId}) has no organizationId filter, same
// cross-tenant lookup pattern already used by completeProfile/
// verifyAccountEmail above.
const getMyTenants = async ({ customerAccountId }) => {
  const memberships = await User.find({ customerAccountId, role: "customer" });
  const now = new Date();

  const rows = await Promise.all(
    memberships.map(async (membership) => {
      const org = await Organization.findOne({ _id: membership.organizationId });
      if (!org || org.status !== "active") return null;
      const company = await Company.findOne({ _id: org.companyId });
      const program = resolveProgram(company, org);

      const balance = await PointsBalance.findOne({
        userId: membership._id,
        organizationId: membership.organizationId
      });

      return {
        organizationId: org._id.toString(),
        slug: org.slug,
        // The client builds /[company]/[outlet] from these two.
        companySlug: company ? company.slug : null,
        name: org.name,
        branding: {
          logoUrl: org.branding.logoUrl,
          bannerUrl: org.branding.bannerUrl,
          primaryColor: org.branding.primaryColor
        },
        // Same lazy expiry the outlet's own dashboard applies, so a balance
        // never reads as alive here and dead there.
        balance: toPoints(effectiveBalanceCenti(balance, now)),
        earnPercent: program.earnPercent,
        expiresAt: expiresAtFor(balance),
        lastActivityAt: balance ? balance.lastActivityAt : null
      };
    })
  );

  return { success: true, memberships: rows.filter(Boolean) };
};

// --- avatar -----------------------------------------------------------

// The client resizes to 256x256 WebP before uploading, which lands around
// 10-20KB. This ceiling is the backstop for a client that doesn't (or won't):
// it has to be generous enough not to reject an honest phone photo that
// slipped through unresized, and tight enough that the collection can't be
// used as free storage.
const MAX_AVATAR_BYTES = 256 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/webp", "image/jpeg", "image/png"];

const setAvatar = async ({ customerAccountId, buffer, mimeType }) => {
  if (!buffer || !buffer.length) throw createHttpError("An image file is required.", 400);
  if (!ALLOWED_AVATAR_TYPES.includes(mimeType)) {
    throw createHttpError("Profile pictures must be a WebP, JPEG, or PNG image.", 400);
  }
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw createHttpError("That image is too large — pick one under 256KB.", 400);
  }

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  const dataBase64 = buffer.toString("base64");
  const existing = await CustomerAvatar.findOne({ customerAccountId });
  if (existing) {
    existing.mimeType = mimeType;
    existing.dataBase64 = dataBase64;
    existing.byteSize = buffer.length;
    existing.updatedAt = new Date();
    await existing.save();
  } else {
    await CustomerAvatar.create({
      customerAccountId,
      mimeType,
      dataBase64,
      byteSize: buffer.length
    });
  }

  // Bumped, never set to a timestamp: the served image is cached immutably
  // against this number, so it only has to change, not mean anything.
  account.avatarVersion = (account.avatarVersion || 0) + 1;
  await account.save();

  return formatGlobalSessionPayload(account);
};

const removeAvatar = async ({ customerAccountId }) => {
  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  await CustomerAvatar.deleteOne({ customerAccountId });
  // Still bumped rather than reset to 0: any URL already in a cache pins the
  // old version, so reusing a number would serve the deleted picture back.
  account.avatarVersion = (account.avatarVersion || 0) + 1;
  await account.save();

  return formatGlobalSessionPayload(account);
};

const getAvatar = async (customerAccountId) => {
  const row = await CustomerAvatar.findOne({ customerAccountId });
  if (!row) return null;
  return {
    mimeType: row.mimeType,
    buffer: Buffer.from(row.dataBase64, "base64"),
    updatedAt: row.updatedAt
  };
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
  ensureMembership,
  getMyTenants,
  setAvatar,
  removeAvatar,
  getAvatar,
  MAX_AVATAR_BYTES
};
