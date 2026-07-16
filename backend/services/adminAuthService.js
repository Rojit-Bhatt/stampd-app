const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const AdminAccount = require("../models/AdminAccount");
const Company = require("../models/Company");
const Organization = require("../models/Organization");
const User = require("../models/User");
const AdminVerificationToken = require("../models/AdminVerificationToken");
const { formatAuthPayload } = require("./authService");
const { generateCompanySessionToken } = require("../utils/tokenUtils");
const { sendEmail } = require("./emailService");
const {
  createHttpError, hashToken, normalizeEmail, sendAdminVerifyEmail, buildAdminAuthLink
} = require("./companyService");

const SALT_ROUNDS = 10;

// The unified, slug-less admin login. One email+password form for everyone
// on the business side; the credentials alone decide who you are.
//
// This is only unambiguous because every staff credential — company owners
// and outlet admins alike — lives in the single AdminAccount collection with
// one unique email index. Splitting them across two collections would make
// the lookup order load-bearing and the answer arbitrary.
const adminLogin = async ({ email, password }) => {
  if (!email || !password) {
    throw createHttpError("Email and password are required.", 400);
  }

  const account = await AdminAccount.findOne({ email: normalizeEmail(email) });

  // One message for "no such account" and "wrong password" alike — never
  // reveal which, same posture as authService.loginUser.
  if (!account || !account.password) {
    throw createHttpError("You're not registered. Check your email and password.", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, account.password);
  if (!isPasswordValid) {
    throw createHttpError("You're not registered. Check your email and password.", 401);
  }

  const company = await Company.findOne({ _id: account.companyId });
  if (!company) {
    throw createHttpError("This account's company no longer exists.", 401);
  }
  if (company.status === "suspended") {
    const error = createHttpError("This business is currently unavailable.", 403, "TENANT_SUSPENDED");
    throw error;
  }

  if (!account.emailVerified) {
    throw createHttpError(
      "Verify your email before signing in — check your inbox.",
      403,
      "EMAIL_NOT_VERIFIED"
    );
  }

  if (account.kind === "company_owner") {
    return {
      success: true,
      kind: "company_owner",
      token: generateCompanySessionToken({
        adminAccountId: account._id.toString(),
        companyId: company._id.toString()
      }),
      account: { id: account._id.toString(), name: account.name, email: account.email },
      company: { slug: company.slug, name: company.name }
    };
  }

  // outlet_admin — hand back a normal tenant JWT, identical to what every
  // tenant-scoped route already expects, plus both slugs so the frontend
  // knows where to land them.
  const outlet = await Organization.findOne({ _id: account.organizationId });
  if (!outlet) {
    throw createHttpError("This account's outlet no longer exists.", 401);
  }
  if (outlet.status === "suspended" || outlet.status === "archived") {
    throw createHttpError("This business is currently unavailable.", 403, "TENANT_SUSPENDED");
  }

  const membership = await User.findOne({
    organizationId: outlet._id,
    adminAccountId: account._id,
    role: "business_admin"
  });
  if (!membership) {
    throw createHttpError("This account has no outlet membership.", 401);
  }

  return {
    success: true,
    kind: "outlet_admin",
    ...formatAuthPayload(membership),
    company: { slug: company.slug, name: company.name },
    outlet: { slug: outlet.slug, name: outlet.name }
  };
};

const verifyAdminEmail = async ({ token }) => {
  if (!token) throw createHttpError("Verification token is required.", 400);

  const record = await AdminVerificationToken.findOne({
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

  const account = await AdminAccount.findOne({ _id: record.adminAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  account.emailVerified = true;
  await account.save();
  record.usedAt = new Date();
  await record.save();

  // Keep the denormalized copy on the membership row in sync, the same way
  // customerAccountService fans identity changes out to memberships.
  if (account.organizationId) {
    await User.updateOne(
      { organizationId: account.organizationId, adminAccountId: account._id },
      { $set: { emailVerified: true } }
    );
  }

  return { success: true, message: "Email verified. You can now sign in." };
};

const resendAdminVerification = async ({ email }) => {
  if (email) {
    const account = await AdminAccount.findOne({ email: normalizeEmail(email) });
    if (account && !account.emailVerified) {
      await sendAdminVerifyEmail(account);
    }
  }
  return { success: true, message: "If that account exists and is unverified, a new link was sent." };
};

const forgotAdminPassword = async ({ email }) => {
  if (email) {
    const account = await AdminAccount.findOne({ email: normalizeEmail(email) });
    if (account) {
      const raw = crypto.randomBytes(32).toString("hex");
      await AdminVerificationToken.create({
        adminAccountId: account._id,
        type: "password_reset",
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null
      });
      const link = buildAdminAuthLink("admin-reset-password", raw);
      await sendEmail({
        to: account.email,
        subject: "Reset your password",
        html: `<p>Reset your password:</p><p><a href="${link}">${link}</a></p>`
      });
    }
  }
  return { success: true, message: "If that account exists, a reset link was sent." };
};

// Note there is no credential to fan out to: an outlet's password lives only
// on its own AdminAccount, and the membership User row never holds one.
const resetAdminPassword = async ({ token, password }) => {
  if (!token || !password) throw createHttpError("Token and new password are required.", 400);

  const record = await AdminVerificationToken.findOne({
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

  const account = await AdminAccount.findOne({ _id: record.adminAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  account.password = await bcrypt.hash(password, SALT_ROUNDS);
  await account.save();
  record.usedAt = new Date();
  await record.save();

  return { success: true, message: "Password updated. You can now sign in." };
};

module.exports = {
  adminLogin,
  verifyAdminEmail,
  resendAdminVerification,
  forgotAdminPassword,
  resetAdminPassword
};
