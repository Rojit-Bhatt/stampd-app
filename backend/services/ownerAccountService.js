const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const BusinessOwnerAccount = require("../models/BusinessOwnerAccount");
const OwnerVerificationToken = require("../models/OwnerVerificationToken");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { formatAuthPayload } = require("./authService");
const { generateOwnerSessionToken } = require("../utils/tokenUtils");
const { sendEmail } = require("./emailService");
const { startTrialSubscription, assertCanAddBusiness } = require("./subscriptionService");
const { createOrganizationWithAdmin, buildBusinessStats } = require("./platformService");

const SALT_ROUNDS = 10;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const APP_BASE_URL = () => process.env.APP_BASE_URL || "http://localhost:3000";

// Slug-less link, e.g. http://localhost:3000/owner-verify-email?token=... —
// deliberately distinct paths from the customer identity's /verify-email and
// /reset-password so the two global identities never collide on routing.
const buildOwnerAuthLink = (path, token) =>
  `${APP_BASE_URL()}/${path}?token=${encodeURIComponent(token)}`;

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const normalizeEmail = (email) => email.trim().toLowerCase();

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const issueToken = async (ownerAccountId, type) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const ttl = type === "email_verify" ? VERIFY_TTL_MS : RESET_TTL_MS;
  await OwnerVerificationToken.create({
    ownerAccountId,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttl),
    usedAt: null
  });
  return raw;
};

const sendVerifyEmail = async (account) => {
  const raw = await issueToken(account._id, "email_verify");
  const link = buildOwnerAuthLink("owner-verify-email", raw);
  await sendEmail({
    to: account.email,
    subject: "Verify your email",
    html: `<p>Confirm your email to activate your owner account:</p><p><a href="${link}">${link}</a></p>`
  });
};

const formatOwnerSessionPayload = (account) => ({
  success: true,
  token: generateOwnerSessionToken({ ownerAccountId: account._id.toString() }),
  account: {
    id: account._id.toString(),
    name: account.name,
    email: account.email,
    phone: account.phone || "",
    emailVerified: account.emailVerified
  }
});

const registerOwnerAccount = async ({ name, email, password, phone }) => {
  if (!name || !email || !password) {
    throw createHttpError("Name, email, and password are required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const existing = await BusinessOwnerAccount.findOne({ email: normalizedEmail });
  if (existing) {
    throw createHttpError("Email is already registered.", 409);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const account = await BusinessOwnerAccount.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    phone: (phone || "").trim(),
    emailVerified: false
  });

  await sendVerifyEmail(account);
  // Every self-serve owner starts on a 14-day, 1-business trial immediately —
  // no separate Rs 0 plan to special-case at checkout (see plan D3).
  await startTrialSubscription(account._id);

  return {
    success: true,
    message: "Registered. Check your email to verify your account.",
    accountId: account._id.toString()
  };
};

const loginOwnerAccount = async ({ email, password }) => {
  if (!email || !password) {
    throw createHttpError("Email and password are required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const account = await BusinessOwnerAccount.findOne({ email: normalizedEmail });

  if (!account || !account.password) {
    throw createHttpError("That email or password didn't match — try again.", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, account.password);
  if (!isPasswordValid) {
    throw createHttpError("That email or password didn't match — try again.", 401);
  }

  return formatOwnerSessionPayload(account);
};

const verifyOwnerEmail = async ({ token }) => {
  if (!token) throw createHttpError("Verification token is required.", 400);

  const record = await OwnerVerificationToken.findOne({
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

  const account = await BusinessOwnerAccount.findOne({ _id: record.ownerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  account.emailVerified = true;
  await account.save();
  record.usedAt = new Date();
  await record.save();

  return { success: true, message: "Email verified." };
};

const resendOwnerVerification = async ({ email }) => {
  if (email) {
    const account = await BusinessOwnerAccount.findOne({ email: normalizeEmail(email) });
    if (account && !account.emailVerified) {
      await sendVerifyEmail(account);
    }
  }
  return { success: true, message: "If that account exists and is unverified, a new link was sent." };
};

const forgotOwnerPassword = async ({ email }) => {
  if (email) {
    const account = await BusinessOwnerAccount.findOne({ email: normalizeEmail(email) });
    if (account) {
      const raw = await issueToken(account._id, "password_reset");
      const link = buildOwnerAuthLink("owner-reset-password", raw);
      await sendEmail({
        to: account.email,
        subject: "Reset your password",
        html: `<p>Reset your password:</p><p><a href="${link}">${link}</a></p>`
      });
    }
  }
  return { success: true, message: "If that account exists, a reset link was sent." };
};

const resetOwnerPassword = async ({ token, password }) => {
  if (!token || !password) throw createHttpError("Token and new password are required.", 400);

  const record = await OwnerVerificationToken.findOne({
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

  const account = await BusinessOwnerAccount.findOne({ _id: record.ownerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  account.password = await bcrypt.hash(password, SALT_ROUNDS);
  await account.save();
  record.usedAt = new Date();
  await record.save();

  return { success: true, message: "Password updated. You can now log in." };
};

// Exchanges a global owner session (already verified by verifyOwnerSession
// middleware) for a normal tenant JWT scoped to `organizationId` — the
// owner-side analogue of customerAccountService.enterTenant. Deliberately
// does NOT auto-provision a membership on first visit the way a customer
// does: an owner can only enter a business they already have a
// business_admin membership row for (created when they added/were granted
// that business), never any arbitrary org by slug/id. This is the security
// boundary that keeps one owner from entering another owner's business.
const enterBusiness = async ({ ownerAccountId, organizationId }) => {
  const membershipUser = await User.findOne({
    organizationId,
    ownerAccountId,
    role: "business_admin"
  });

  if (!membershipUser) {
    throw createHttpError("You don't have access to this business.", 403);
  }

  return formatAuthPayload(membershipUser);
};

// Every business this owner controls — powers the owner dashboard's business
// grid. User.find({ownerAccountId}) has no organizationId filter, same
// cross-tenant lookup pattern customerAccountService.getMyTenants already
// uses for its own global identity.
const getMyBusinesses = async ({ ownerAccountId }) => {
  const memberships = await User.find({ ownerAccountId, role: "business_admin" });

  const rows = await Promise.all(
    memberships.map(async (membership) => {
      const org = await Organization.findOne({ _id: membership.organizationId });
      if (!org) return null;

      const customersCount = (
        await User.find({ organizationId: org._id, role: "customer" })
      ).length;

      return {
        organizationId: org._id.toString(),
        slug: org.slug,
        name: org.name,
        status: org.status,
        category: org.category,
        branding: { primaryColor: org.branding.primaryColor },
        customersCount
      };
    })
  );

  return { success: true, businesses: rows.filter(Boolean) };
};

// Creates a brand-new business (Organization) for this owner, gated by their
// subscription's business limit (subscriptionService.assertCanAddBusiness —
// throws a 402 with a code the frontend uses to show the upgrade CTA instead
// of a generic error). The new business's admin row is provisioned with the
// SAME password hash as the owner's account (not a separate credential) —
// this is a deliberate simplification: daily operation of an owner-created
// business goes through /api/owner/enter-business, but this also means the
// owner's existing password literally works if they ever log in directly at
// the tenant's /:slug/admin/login instead, with zero extra setup. A business
// onboarded directly by the platform admin (no owner attached) is
// unaffected — its business_admin row keeps its own independent password
// exactly as before.
const createBusinessForOwner = async ({ ownerAccountId, name, slug, category }) => {
  if (!name || !slug) {
    throw createHttpError("name and slug are required.", 400);
  }

  await assertCanAddBusiness(ownerAccountId);

  const account = await BusinessOwnerAccount.findOne({ _id: ownerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);
  if (!account.emailVerified) {
    throw createHttpError("Verify your email before adding a business.", 403);
  }

  const { organization } = await createOrganizationWithAdmin({
    name,
    slug,
    category,
    adminName: account.name,
    adminEmail: account.email,
    hashedPassword: account.password,
    emailVerified: account.emailVerified,
    ownerAccountId
  });

  return { success: true, business: await buildBusinessStats(organization) };
};

module.exports = {
  createHttpError,
  registerOwnerAccount,
  loginOwnerAccount,
  verifyOwnerEmail,
  resendOwnerVerification,
  forgotOwnerPassword,
  resetOwnerPassword,
  enterBusiness,
  getMyBusinesses,
  createBusinessForOwner
};
