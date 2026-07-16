const bcrypt = require("bcryptjs");
const Organization = require("../models/Organization");
const User = require("../models/User");
const StampClaimEvent = require("../models/StampClaimEvent");
const Voucher = require("../models/Voucher");
const { generateAuthToken } = require("../utils/tokenUtils");
const { DEFAULT_PROGRAM, BUSINESS_CATEGORIES } = require("../config/platform");
const { sendVerifyEmail } = require("./authService");
const { logAction } = require("./platformAuditService");

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
      role: user.role,
      platformRole: user.platformRole || "owner"
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

// Shared core: creates the Organization + its business_admin User row.
// Extracted so the owner-driven "add a business" flow (subscriptionService/
// ownerAccountService, plan-limit-gated) can reuse the exact same
// organization-provisioning logic instead of duplicating it — the caller is
// responsible for anything specific to how it got here (platform-admin
// onboarding sends a verify email + writes a PlatformAuditLog entry below;
// the owner flow does neither, since the admin row's emailVerified is
// copied from the already-owned account and there's no platform actorId).
const createOrganizationWithAdmin = async ({
  name, slug, category, adminName, adminEmail, hashedPassword, emailVerified, ownerAccountId
}) => {
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
    program: { ...DEFAULT_PROGRAM },
    ownerAccountId: ownerAccountId || null
  });

  const normalizedAdminEmail = normalizeEmail(adminEmail);

  const admin = await User.create({
    organizationId: organization._id,
    name: adminName.trim(),
    email: normalizedAdminEmail,
    password: hashedPassword,
    role: "business_admin",
    emailVerified: Boolean(emailVerified),
    ownerAccountId: ownerAccountId || null
  });

  return { organization, admin };
};

const createBusiness = async ({ name, slug, adminName, adminEmail, adminPassword, category, actorId, actorName }) => {
  if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
    throw createHttpError(
      "name, slug, adminName, adminEmail, and adminPassword are required.",
      400
    );
  }

  const hashedPassword = await bcrypt.hash(adminPassword, SALT_ROUNDS);

  const { organization, admin } = await createOrganizationWithAdmin({
    name, slug, category, adminName, adminEmail, hashedPassword, emailVerified: false
  });

  await sendVerifyEmail(admin, organization._id, organization.slug);

  await logAction({
    actorId,
    actorName,
    action: "onboard",
    organizationId: organization._id,
    targetName: organization.name,
    details: `Onboarded with admin ${admin.email}`
  });

  return {
    success: true,
    business: await buildBusinessStats(organization),
    admin: { email: admin.email },
    tenantPath: `/${organization.slug}/admin`
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

const updateBusiness = async (id, { name, category, status, adminEmail, actorId, actorName }) => {
  const organization = await Organization.findOne({ _id: id });

  if (!organization) {
    throw createHttpError("Business not found.", 404);
  }

  if (status !== undefined && status !== "active" && status !== "suspended") {
    throw createHttpError("status must be either 'active' or 'suspended'.", 400);
  }

  if (category !== undefined && !BUSINESS_CATEGORIES.includes(category)) {
    throw createHttpError("Not a valid category.", 400);
  }

  const updates = {};

  if (name !== undefined) {
    updates.name = name.trim();
  }

  if (category !== undefined) {
    updates.category = category;
  }

  if (status !== undefined) {
    updates.status = status;
  }

  const updatedOrganization = await Organization.findOneAndUpdate(
    { _id: id },
    { $set: updates },
    { new: true }
  );

  let adminResult = null;
  let adminEmailChanged = false;

  if (adminEmail !== undefined) {
    const normalizedAdminEmail = normalizeEmail(adminEmail);
    const adminUser = await User.findOne({ organizationId: id, role: "business_admin" });

    if (!adminUser) {
      throw createHttpError("This business has no admin account to update.", 404);
    }

    if (adminUser.email !== normalizedAdminEmail) {
      const collision = await User.findOne({ organizationId: id, email: normalizedAdminEmail });
      if (collision) {
        throw createHttpError("That email is already in use for this business.", 409);
      }

      const updatedAdmin = await User.findOneAndUpdate(
        { _id: adminUser._id },
        { $set: { email: normalizedAdminEmail, emailVerified: false } },
        { new: true }
      );

      await sendVerifyEmail(updatedAdmin, id, updatedOrganization.slug);
      adminResult = { email: updatedAdmin.email };
      adminEmailChanged = true;
    } else {
      adminResult = { email: adminUser.email };
    }
  }

  const changeParts = [];
  if (name !== undefined && updates.name !== undefined) changeParts.push(`name → "${updates.name}"`);
  if (category !== undefined && updates.category !== undefined) changeParts.push(`category → ${updates.category}`);
  if (adminEmailChanged) changeParts.push(`admin email → ${adminResult.email}`);

  if (status !== undefined) {
    await logAction({
      actorId,
      actorName,
      action: status === "suspended" ? "suspend" : "reactivate",
      organizationId: id,
      targetName: updatedOrganization.name,
      details: changeParts.join("; ")
    });
  } else if (changeParts.length) {
    await logAction({
      actorId,
      actorName,
      action: "edit",
      organizationId: id,
      targetName: updatedOrganization.name,
      details: changeParts.join("; ")
    });
  }

  return {
    success: true,
    business: await buildBusinessStats(updatedOrganization),
    ...(adminResult ? { admin: adminResult } : {})
  };
};

module.exports = {
  createHttpError,
  loginPlatformAdmin,
  listBusinesses,
  createBusiness,
  createOrganizationWithAdmin,
  getBusiness,
  updateBusiness,
  buildBusinessStats
};
