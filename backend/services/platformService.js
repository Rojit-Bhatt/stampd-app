const bcrypt = require("bcryptjs");
const Organization = require("../models/Organization");
const User = require("../models/User");
const StampClaimEvent = require("../models/StampClaimEvent");
const Voucher = require("../models/Voucher");
const { generateAuthToken } = require("../utils/tokenUtils");
const { DEFAULT_PROGRAM, BUSINESS_CATEGORIES } = require("../config/platform");
const { sendVerifyEmail } = require("./authService");

const SALT_ROUNDS = 10;

// The in-memory mock DB only fills top-level schema defaults, not nested
// sub-document defaults (branding/program). Passing these explicitly keeps
// behavior identical against real Mongoose (which would set the same
// values anyway) while making the mock DB behave correctly too.
const DEFAULT_BRANDING = {
  tagline: "",
  logoUrl: "",
  bannerUrl: "",
  primaryColor: "#7c3f1d"
};

const normalizeEmail = (email) => email.trim().toLowerCase();

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeSlug = (slug) =>
  slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

const buildBusinessStats = async (org) => {
  const customersCount = (
    await User.find({ organizationId: org._id, role: "customer" })
  ).length;
  const stampsIssued = (
    await StampClaimEvent.find({ organizationId: org._id })
  ).length;
  const vouchersRedeemed = (
    await Voucher.find({ organizationId: org._id, isValid: false })
  ).length;

  return {
    id: org._id.toString(),
    name: org.name,
    slug: org.slug,
    status: org.status,
    category: org.category,
    branding: org.branding,
    menuEnabled: org.menuEnabled,
    customersCount,
    stampsIssued,
    vouchersRedeemed
  };
};

const loginPlatformAdmin = async ({ email, password }) => {
  if (!email || !password) {
    throw createHttpError("Email and password are required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail, role: "platform" });

  if (!user || !user.password) {
    throw createHttpError("That email or password didn't match — try again.", 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw createHttpError("That email or password didn't match — try again.", 401);
  }

  const token = generateAuthToken({
    userId: user._id.toString(),
    role: "platform",
    organizationId: null
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

const listBusinesses = async () => {
  const organizations = await Organization.find({});
  const businesses = await Promise.all(organizations.map(buildBusinessStats));

  return {
    success: true,
    businesses
  };
};

const createBusiness = async ({ name, slug, adminName, adminEmail, adminPassword, category }) => {
  if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
    throw createHttpError(
      "name, slug, adminName, adminEmail, and adminPassword are required.",
      400
    );
  }

  const normalizedSlug = normalizeSlug(slug);

  if (!normalizedSlug) {
    throw createHttpError("A valid slug is required.", 400);
  }

  const existingOrg = await Organization.findOne({ slug: normalizedSlug });

  if (existingOrg) {
    throw createHttpError("A business with this slug already exists.", 409);
  }

  // Onboarding shouldn't hard-fail over a bad/missing category — fall back
  // to the safe default instead of throwing.
  const safeCategory = BUSINESS_CATEGORIES.includes(category) ? category : "other";

  const organization = await Organization.create({
    name: name.trim(),
    slug: normalizedSlug,
    category: safeCategory,
    branding: { ...DEFAULT_BRANDING },
    program: { ...DEFAULT_PROGRAM }
  });

  const hashedPassword = await bcrypt.hash(adminPassword, SALT_ROUNDS);
  const normalizedAdminEmail = normalizeEmail(adminEmail);

  const admin = await User.create({
    organizationId: organization._id,
    name: adminName.trim(),
    email: normalizedAdminEmail,
    password: hashedPassword,
    role: "business_admin",
    emailVerified: false
  });

  await sendVerifyEmail(admin, organization._id, normalizedSlug);

  return {
    success: true,
    business: await buildBusinessStats(organization),
    admin: { email: admin.email },
    tenantPath: `/${normalizedSlug}/admin`
  };
};

const getBusiness = async (id) => {
  const organization = await Organization.findOne({ _id: id });

  if (!organization) {
    throw createHttpError("Business not found.", 404);
  }

  return {
    success: true,
    business: await buildBusinessStats(organization)
  };
};

const updateBusiness = async (id, { name, status }) => {
  const organization = await Organization.findOne({ _id: id });

  if (!organization) {
    throw createHttpError("Business not found.", 404);
  }

  if (status !== undefined && status !== "active" && status !== "suspended") {
    throw createHttpError("status must be either 'active' or 'suspended'.", 400);
  }

  const updates = {};

  if (name !== undefined) {
    updates.name = name.trim();
  }

  if (status !== undefined) {
    updates.status = status;
  }

  const updatedOrganization = await Organization.findOneAndUpdate(
    { _id: id },
    { $set: updates },
    { new: true }
  );

  return {
    success: true,
    business: await buildBusinessStats(updatedOrganization)
  };
};

module.exports = {
  createHttpError,
  loginPlatformAdmin,
  listBusinesses,
  createBusiness,
  getBusiness,
  updateBusiness
};
