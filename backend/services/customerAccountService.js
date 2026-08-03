const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const CustomerAccount = require("../models/CustomerAccount");
const PushSubscription = require("../models/PushSubscription");
const CustomerAvatar = require("../models/CustomerAvatar");
const AccountVerificationToken = require("../models/AccountVerificationToken");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Company = require("../models/Company");
const PointsBalance = require("../models/PointsBalance");
const PointsTransaction = require("../models/PointsTransaction");
const PendingClaim = require("../models/PendingClaim");
const { ensureUserPointsBalance, formatAuthPayload } = require("./authService");
const { effectiveBalanceCenti, expiresAtFor } = require("./pointsService");
const { toPoints } = require("../utils/pointsMath");
const { sniffImageType } = require("../utils/imageBytes");
const { generateGlobalSessionToken } = require("../utils/tokenUtils");
const { resolveProgram } = require("./programService");
const { resolveGoogleLink } = require("../utils/googleLink");
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

const createHttpError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const OTP_TTL_MS = 10 * 60 * 1000;

const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const issueToken = async (customerAccountId, type) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const isVerify = type === "email_verify";
  const ttl = isVerify ? OTP_TTL_MS : RESET_TTL_MS;

  if (isVerify) {
    const stale = await AccountVerificationToken.find({ customerAccountId, type: "email_verify", usedAt: null });
    for (const record of stale) {
      record.usedAt = new Date();
      await record.save();
    }
  }

  await AccountVerificationToken.create({
    customerAccountId,
    type,
    code: isVerify ? generateOtp() : null,
    attempts: 0,
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
  const record = await AccountVerificationToken.findOne({ tokenHash: hashToken(raw) });
  sendEmail({
    to: account.email,
    subject: "Your Stampd verification code",
    html: `<p>Your code is <strong>${record.code}</strong>. It expires in 10 minutes.</p>`
  }).catch((err) => console.error(`Failed to email verify-code to ${account.email}:`, err.message));
};

const formatAccountSummary = (account) => ({
  id: account._id.toString(),
  name: account.name,
  email: account.email,
  emailVerified: account.emailVerified,
  avatarVersion: account.avatarVersion || 0,
  marketingConsent: account.marketingConsent,
  birthdayMonth: account.birthdayMonth ?? null,
  birthdayDay: account.birthdayDay ?? null,
  gender: account.gender ?? null
});

const formatGlobalSessionPayload = (account) => ({
  success: true,
  token: generateGlobalSessionToken({ customerAccountId: account._id.toString() }),
  account: formatAccountSummary(account)
});

// The same account shape WITHOUT a fresh session token — for endpoints that
// change the account but are not authentication. Minting a token from, say,
// an avatar upload would let a client extend its session indefinitely by
// re-uploading a picture, which is not a decision an avatar endpoint should
// get to make.
const formatAccountPayload = (account) => ({
  success: true,
  account: formatAccountSummary(account)
});

// Pushes a now-verified account's flag out to every tenant membership row it
// owns. Outlet-scoped code — the redeem gate in pointsService above all —
// reads emailVerified off the User row, never off the account, so an account
// marked verified without this fan-out is verified nowhere that matters.
//
// One implementation, three callers (verify-by-email, Google sign-in, and the
// legacy tenant-scoped verify in authService): it used to be a copy-pasted
// loop per caller, and the copies had already drifted apart on whether they
// re-saved rows that were already true.
const syncVerifiedToMemberships = async (account) => {
  const members = await User.find({ customerAccountId: account._id });
  for (const member of members) {
    if (!member.emailVerified) {
      member.emailVerified = true;
      await member.save();
    }
  }
};

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

const registerAccount = async ({
  name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent, marketingSmsConsent,
  companySlug, outletSlug, birthdayMonth, birthdayDay, gender
}) => {
  if (!name || !email || !password) {
    throw createHttpError("Name, email, and password are required.", 400);
  }
  if (!phone || !phone.trim()) {
    throw createHttpError("Phone number is required.", 400);
  }

  // Only the tenant-scoped register form sends both slugs — that's the one
  // registration surface with a submit moment to block. The global form and
  // the claim-flow inline signup never send them, so this block is skipped
  // for both, by design.
  if (companySlug && outletSlug) {
    // Organization/Company slugs are stored lowercase (schema-level
    // `lowercase: true`) — resolveTenant always normalizes both slugs the
    // same way before querying, and this has to match or a mixed-case
    // outlet slug silently finds no organization.
    const normalizedCompanySlug = String(companySlug).trim().toLowerCase();
    const normalizedOutletSlug = String(outletSlug).trim().toLowerCase();
    const company = await Company.findOne({ slug: normalizedCompanySlug });
    const organization = company
      ? await Organization.findOne({ companyId: company._id, slug: normalizedOutletSlug })
      : null;
    if (organization) {
      if (organization.customerInfo.requireDateOfBirth && (birthdayMonth === undefined || birthdayDay === undefined)) {
        throw createHttpError("This business needs your date of birth to sign up.", 400);
      }
      if (organization.customerInfo.requireGender && gender === undefined) {
        throw createHttpError("This business needs your gender to sign up.", 400);
      }
    }
  }

  const normalizedEmail = normalizeEmail(email);
  const existing = await CustomerAccount.findOne({ email: normalizedEmail });
  if (existing) {
    throw createHttpError("Email is already registered.", 409);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const marketingConsent = {};
  if (marketingEmailConsent) marketingConsent.email = { granted: true, updatedAt: new Date() };
  if (marketingSmsConsent) marketingConsent.sms = { granted: true, updatedAt: new Date() };

  const account = await CustomerAccount.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone.trim(),
    emailVerified: false,
    ...(birthdayMonth !== undefined ? { birthdayMonth: Number(birthdayMonth) } : {}),
    ...(birthdayDay !== undefined ? { birthdayDay: Number(birthdayDay) } : {}),
    ...(gender !== undefined ? { gender } : {}),
    ...(Object.keys(marketingConsent).length ? { marketingConsent } : {})
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

  const sessionPayload = formatGlobalSessionPayload(account);
  return {
    ...sessionPayload,
    message: "Registered. Check your email to verify your account when you are ready.",
    accountId: account._id.toString()
  };
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

  // See utils/googleLink.js — the linking rules live there, pure and
  // directly tested, because this path can't be reached from a test without
  // a genuinely signed Google token.
  const { linkGoogleId, markVerified, clearPassword } = resolveGoogleLink(account, googleId);

  let shouldSave = false;
  if (linkGoogleId) {
    account.googleId = googleId;
    shouldSave = true;
  }
  if (!account.name && name) {
    account.name = name;
    shouldSave = true;
  }
  if (markVerified) {
    account.emailVerified = true;
    shouldSave = true;
  }
  if (clearPassword) {
    account.password = null;
    shouldSave = true;
  }
  if (shouldSave) await account.save();

  if (account.emailVerified) await syncVerifiedToMemberships(account);

  const out = formatGlobalSessionPayload(account);
  out.needsPhone = !account.phone;
  return out;
};

// --- profile (global) --------------------------------------------------

// Name and password belong to the CustomerAccount, not to any one outlet's
// membership row. The tenant-scoped /api/account equivalents write the User
// row instead, which for a customer means: a rename is silently reverted by
// the next ensureMembership re-sync, and a password change reports success
// while sign-in (which reads CustomerAccount.password) keeps the old one.
// These are the versions the customer app uses.
const updateAccountProfile = async ({ customerAccountId, name }) => {
  if (!name || !name.trim()) throw createHttpError("Name is required.", 400);

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  account.name = name.trim();
  await account.save();

  // name is denormalized onto every membership (that's what outlet-scoped
  // reporting reads), so it has to travel — same shape as completeProfile's
  // phone fan-out below. Mock DB has no updateMany: find+save loop.
  const members = await User.find({ customerAccountId: account._id });
  for (const member of members) {
    if (member.name !== account.name) {
      member.name = account.name;
      await member.save();
    }
  }

  return formatAccountPayload(account);
};

const GENDER_VALUES = ["male", "female", "other", "prefer_not_to_say"];

const updatePreferences = async ({ customerAccountId, emailOptIn, smsOptIn, birthdayMonth, birthdayDay, gender }) => {
  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  if (emailOptIn !== undefined) {
    account.marketingConsent.email = { granted: Boolean(emailOptIn), updatedAt: new Date() };
  }
  if (smsOptIn !== undefined) {
    account.marketingConsent.sms = { granted: Boolean(smsOptIn), updatedAt: new Date() };
  }
  if (birthdayMonth !== undefined) {
    account.birthdayMonth = birthdayMonth === null ? null : Number(birthdayMonth);
  }
  if (birthdayDay !== undefined) {
    account.birthdayDay = birthdayDay === null ? null : Number(birthdayDay);
  }
  if (gender !== undefined) {
    if (gender !== null && !GENDER_VALUES.includes(gender)) {
      throw createHttpError("That's not a valid gender value.", 400);
    }
    account.gender = gender;
  }

  await account.save();
  return formatAccountPayload(account);
};

const savePushSubscription = async ({ customerAccountId, endpoint, keys }) => {
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { customerAccountId, endpoint, keys } },
    { upsert: true, new: true }
  );

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);
  account.marketingConsent.push = { granted: true, updatedAt: new Date() };
  await account.save();

  return formatAccountPayload(account);
};

const removePushSubscription = async ({ customerAccountId, endpoint }) => {
  await PushSubscription.deleteOne({ endpoint, customerAccountId });

  const remaining = await PushSubscription.countDocuments({ customerAccountId });
  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  if (remaining === 0) {
    account.marketingConsent.push = { granted: false, updatedAt: new Date() };
    await account.save();
  }

  return formatAccountPayload(account);
};

const changeAccountPassword = async ({ customerAccountId, currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword) {
    throw createHttpError("Current and new password are required.", 400);
  }
  if (newPassword.length < 8) {
    throw createHttpError("New password must be at least 8 characters.", 400);
  }

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  if (!account.password) {
    // Either a Google-only signup, or an account whose unproven password was
    // discarded when Google proved the address (see utils/googleLink.js).
    // Password reset is the way in — it mails the address Google verified.
    throw createHttpError(
      "This account signs in with Google. Use \"forgot password\" if you'd like to set one.",
      400
    );
  }

  const isValid = await bcrypt.compare(currentPassword, account.password);
  if (!isValid) throw createHttpError("Current password is incorrect.", 401);

  account.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await account.save();

  return { success: true, message: "Password updated." };
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

  await syncVerifiedToMemberships(account);

  // Fulfill any pending stamp claims this account was waiting on, now that
  // it's verified. Required late (avoids a require-cycle since
  // pendingClaimService also needs ensureMembership from this file).
  const { autoFulfillForAccount } = require("./pendingClaimService");
  const fulfilled = await autoFulfillForAccount(account._id.toString());

  return { success: true, message: "Email verified.", fulfilled };
};

const verifyCustomerOtp = async ({ email, code }) => {
  if (!email || !code) {
    throw createHttpError("Email and code are required.", 400);
  }

  const account = await CustomerAccount.findOne({ email: normalizeEmail(email) });
  if (!account) {
    throw createHttpError("This code is invalid or has expired.", 400, "OTP_EXPIRED");
  }

  const record = await AccountVerificationToken.findOne({
    customerAccountId: account._id,
    type: "email_verify",
    usedAt: null
  });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This code is invalid or has expired.", 400, "OTP_EXPIRED");
  }

  if (record.code !== code) {
    record.attempts += 1;
    if (record.attempts >= 5) {
      record.usedAt = new Date();
      await record.save();
      throw createHttpError("Too many wrong attempts. Request a new code.", 429, "OTP_LOCKED");
    }
    await record.save();
    throw createHttpError("That code is incorrect.", 400, "OTP_INCORRECT");
  }

  record.usedAt = new Date();
  await record.save();

  account.emailVerified = true;
  await account.save();

  await syncVerifiedToMemberships(account);

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

      // Only include businesses where they have done at least one transaction.
      // Balance amount can be zero (e.g. if redeemed), so we check the transaction ledger.
      const hasTransaction = await PointsTransaction.findOne({
        userId: membership._id,
        organizationId: membership.organizationId
      });
      if (!hasTransaction) return null;

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

const setAvatar = async ({ customerAccountId, buffer }) => {
  if (!buffer || !buffer.length) throw createHttpError("An image file is required.", 400);
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw createHttpError("That image is too large — pick one under 256KB.", 400);
  }
  const mimeType = sniffImageType(buffer);
  if (!mimeType) {
    throw createHttpError("Profile pictures must be a WebP, JPEG, or PNG image.", 400);
  }

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  // One atomic upsert, not findOne-then-create: two uploads racing each other
  // would both miss the read and both insert, leaving two rows for one
  // account. getAvatar's findOne would then return whichever the driver
  // handed back first, so the picture would appear to randomly revert. The
  // unique index can't be relied on to catch it either — the mock DB used in
  // dev/test doesn't enforce indexes at all.
  await CustomerAvatar.findOneAndUpdate(
    { customerAccountId },
    {
      $set: {
        customerAccountId,
        mimeType,
        dataBase64: buffer.toString("base64"),
        byteSize: buffer.length,
        updatedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );

  // Bumped, never set to a timestamp: the served image is cached immutably
  // against this number, so it only has to change, not mean anything.
  account.avatarVersion = (account.avatarVersion || 0) + 1;
  await account.save();

  return formatAccountPayload(account);
};

const removeAvatar = async ({ customerAccountId }) => {
  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  await CustomerAvatar.deleteOne({ customerAccountId });
  // Still bumped rather than reset to 0: any URL already in a cache pins the
  // old version, so reusing a number would serve the deleted picture back.
  account.avatarVersion = (account.avatarVersion || 0) + 1;
  await account.save();

  return formatAccountPayload(account);
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

const deleteCustomerAccount = async ({ customerAccountId, email }) => {
  if (!email || !email.trim()) {
    throw createHttpError("Email confirmation is required.", 400);
  }

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  if (account.email.toLowerCase() !== email.trim().toLowerCase()) {
    throw createHttpError("Confirmation email does not match your account email.", 400);
  }

  // 1. Find all memberships (User rows) associated with this customer account
  const members = await User.find({ customerAccountId: account._id });
  const memberIds = members.map(m => m._id);

  // 2. Delete all PointsTransactions for these memberships. Per-id, not
  // `$in` — the mock DB's query matcher only supports top-level equality/
  // $or/$lte/$gte and throws on anything else.
  await Promise.all(memberIds.map((id) => PointsTransaction.deleteMany({ userId: id })));

  // 3. Delete all PointsBalances for these memberships (same $in constraint).
  await Promise.all(memberIds.map((id) => PointsBalance.deleteMany({ userId: id })));

  // 4. Delete all PendingClaims for this customer account
  await PendingClaim.deleteMany({ customerAccountId: account._id });

  // 5. Delete CustomerAvatar
  await CustomerAvatar.deleteMany({ customerAccountId: account._id });

  // 6. Delete AccountVerificationTokens
  await AccountVerificationToken.deleteMany({ customerAccountId: account._id });

  // 7. Delete User memberships
  await User.deleteMany({ customerAccountId: account._id });

  // 8. Delete the CustomerAccount itself
  await CustomerAccount.deleteOne({ _id: account._id });

  return { success: true };
};

module.exports = {
  registerAccount,
  loginAccount,
  authenticateWithGoogle,
  completeProfile,
  updateAccountProfile,
  updatePreferences,
  savePushSubscription,
  removePushSubscription,
  changeAccountPassword,
  verifyAccountEmail,
  verifyCustomerOtp,
  resendVerification,
  forgotPassword,
  resetPassword,
  enterTenant,
  ensureMembership,
  syncVerifiedToMemberships,
  getMyTenants,
  setAvatar,
  removeAvatar,
  getAvatar,
  deleteCustomerAccount,
  MAX_AVATAR_BYTES
};
