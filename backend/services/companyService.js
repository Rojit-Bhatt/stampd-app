const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Company = require("../models/Company");
const AdminAccount = require("../models/AdminAccount");
const AdminVerificationToken = require("../models/AdminVerificationToken");
const Organization = require("../models/Organization");
const User = require("../models/User");
const { formatAuthPayload } = require("./authService");
const { sendEmail } = require("./emailService");
const { assertCanAddOutlet } = require("./subscriptionService");
const { DEFAULT_PROGRAM, BUSINESS_CATEGORIES, isReservedSlug } = require("../config/platform");

const SALT_ROUNDS = 10;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const APP_BASE_URL = () => process.env.APP_BASE_URL || "http://localhost:3000";

// Staff auth links are slug-less — an AdminAccount is a global identity, and
// the unified login figures out where it belongs.
const buildAdminAuthLink = (path, token) =>
  `${APP_BASE_URL()}/${path}?token=${encodeURIComponent(token)}`;

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeSlug = (slug) =>
  String(slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

const createHttpError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

// The mock DB doesn't enforce unique indexes, and more importantly this is
// the one guarantee the unified admin login depends on: one email, one
// identity, platform-wide. Checked on every path that mints an AdminAccount.
const assertEmailAvailable = async (email) => {
  const existing = await AdminAccount.findOne({ email });
  if (existing) {
    throw createHttpError("That email is already in use by another admin.", 409, "EMAIL_TAKEN");
  }
};

const issueToken = async (adminAccountId, type) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const ttl = type === "email_verify" ? VERIFY_TTL_MS : RESET_TTL_MS;
  await AdminVerificationToken.create({
    adminAccountId,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttl),
    usedAt: null
  });
  return raw;
};

const sendAdminVerifyEmail = async (account) => {
  const raw = await issueToken(account._id, "email_verify");
  const link = buildAdminAuthLink("admin-verify-email", raw);
  await sendEmail({
    to: account.email,
    subject: "Verify your email",
    html: `<p>Confirm your email to activate your admin account:</p><p><a href="${link}">${link}</a></p>`
  });
};

const formatCompany = (company) => ({
  id: company._id.toString(),
  slug: company.slug,
  name: company.name,
  status: company.status,
  branding: company.branding,
  programDefaults: company.programDefaults,
  createdAt: company.createdAt
});

const formatOutlet = (organization) => ({
  id: organization._id.toString(),
  slug: organization.slug,
  name: organization.name,
  status: organization.status,
  category: organization.category,
  branding: organization.branding,
  menuEnabled: organization.menuEnabled,
  createdAt: organization.createdAt
});

// Registers a company + its owner's AdminAccount. Platform-admin only — a
// company never self-registers. Both the company slug and the owner email
// are validated before anything is written.
const createCompany = async ({ name, slug, ownerName, ownerEmail, ownerPassword, phone }) => {
  if (!name || !slug || !ownerName || !ownerEmail || !ownerPassword) {
    throw createHttpError("name, slug, ownerName, ownerEmail, and ownerPassword are required.", 400);
  }

  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) throw createHttpError("A valid slug is required.", 400);
  if (isReservedSlug(normalizedSlug)) {
    throw createHttpError(`'${normalizedSlug}' is a reserved name — pick another.`, 400, "RESERVED_SLUG");
  }

  const existingCompany = await Company.findOne({ slug: normalizedSlug });
  if (existingCompany) throw createHttpError("A company with this slug already exists.", 409);

  const normalizedEmail = normalizeEmail(ownerEmail);
  await assertEmailAvailable(normalizedEmail);

  const company = await Company.create({
    name: name.trim(),
    slug: normalizedSlug,
    branding: { logoUrl: "", primaryColor: "#7c3f1d" },
    programDefaults: { ...DEFAULT_PROGRAM }
  });

  const owner = await AdminAccount.create({
    name: ownerName.trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(ownerPassword, SALT_ROUNDS),
    phone: (phone || "").trim(),
    kind: "company_owner",
    companyId: company._id,
    organizationId: null,
    emailVerified: false
  });

  await sendAdminVerifyEmail(owner);

  return { company, owner };
};

// Creates an outlet under a company, with its OWN independent credentials
// supplied by the company owner. The password is hashed fresh here and lives
// only on this outlet's AdminAccount — outlets deliberately never share a
// credential with their company or with each other.
const createOutlet = async ({ companyId, name, slug, category, adminName, adminEmail, adminPassword }) => {
  if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
    throw createHttpError("name, slug, adminName, adminEmail, and adminPassword are required.", 400);
  }

  await assertCanAddOutlet(companyId);

  const company = await Company.findOne({ _id: companyId });
  if (!company) throw createHttpError("Company not found.", 404);

  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) throw createHttpError("A valid slug is required.", 400);

  // Only unique within this company — /acme/downtown and /bros/downtown are
  // both fine.
  const existingOutlet = await Organization.findOne({ companyId, slug: normalizedSlug });
  if (existingOutlet) {
    throw createHttpError("This company already has an outlet with that slug.", 409);
  }

  const normalizedEmail = normalizeEmail(adminEmail);
  await assertEmailAvailable(normalizedEmail);

  const safeCategory = BUSINESS_CATEGORIES.includes(category) ? category : "other";

  const organization = await Organization.create({
    companyId,
    name: name.trim(),
    slug: normalizedSlug,
    category: safeCategory,
    branding: { tagline: "", logoUrl: "", bannerUrl: "", primaryColor: "#7c3f1d" },
    // All nulls — this outlet inherits the company's defaults until it
    // explicitly overrides a field. See programService.resolveProgram.
    program: {
      stampsRequired: null, rewardTitle: null, rewardDescription: null,
      cooldownHours: null, minBillAmount: null, voucherExpiryDays: null
    }
  });

  const adminAccount = await AdminAccount.create({
    name: adminName.trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(adminPassword, SALT_ROUNDS),
    kind: "outlet_admin",
    companyId,
    organizationId: organization._id,
    emailVerified: false
  });

  // The tenant-scoped membership row that actually carries the tenant JWT.
  // Holds no password — the credential lives on the AdminAccount above.
  await User.create({
    organizationId: organization._id,
    companyId,
    adminAccountId: adminAccount._id,
    name: adminName.trim(),
    email: normalizedEmail,
    role: "business_admin",
    emailVerified: false
  });

  await sendAdminVerifyEmail(adminAccount);

  return { organization, adminAccount };
};

const listOutlets = async (companyId) => {
  const outlets = await Organization.find({ companyId });
  const rows = await Promise.all(
    outlets.map(async (outlet) => {
      const customersCount = (
        await User.find({ organizationId: outlet._id, role: "customer" })
      ).length;
      const admin = await AdminAccount.findOne({ organizationId: outlet._id });
      return {
        ...formatOutlet(outlet),
        customersCount,
        admin: admin ? { email: admin.email, name: admin.name, emailVerified: admin.emailVerified } : null
      };
    })
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name));
};

// Soft-delete: the outlet stops serving customers and frees a subscription
// slot, but every customer/loyalty/menu row it owns stays intact for
// reporting. Reversible via restoreOutlet — never cascades a delete.
const archiveOutlet = async ({ companyId, outletId }) => {
  const outlet = await Organization.findOne({ _id: outletId, companyId });
  if (!outlet) throw createHttpError("Outlet not found.", 404);
  if (outlet.status === "archived") throw createHttpError("That outlet is already archived.", 400);

  const updated = await Organization.findOneAndUpdate(
    { _id: outletId },
    { $set: { status: "archived" } },
    { new: true }
  );
  return { success: true, outlet: formatOutlet(updated) };
};

const restoreOutlet = async ({ companyId, outletId }) => {
  const outlet = await Organization.findOne({ _id: outletId, companyId });
  if (!outlet) throw createHttpError("Outlet not found.", 404);
  if (outlet.status !== "archived") throw createHttpError("That outlet isn't archived.", 400);

  // Restoring re-occupies a slot, so it has to pass the same gate as
  // creating one — otherwise archiving then restoring would be a way around
  // the plan limit.
  await assertCanAddOutlet(companyId);

  const updated = await Organization.findOneAndUpdate(
    { _id: outletId },
    { $set: { status: "active" } },
    { new: true }
  );
  return { success: true, outlet: formatOutlet(updated) };
};

// Exchanges a company-owner session for a normal tenant JWT scoped to one of
// its outlets. Deliberately does NOT auto-provision a membership the way the
// customer path does: an owner can only enter an outlet its company actually
// owns, and the ownership check IS the security boundary that stops one
// company reaching another's outlet.
const enterOutlet = async ({ companyId, organizationId }) => {
  const outlet = await Organization.findOne({ _id: organizationId, companyId });
  if (!outlet) {
    throw createHttpError("You don't have access to this outlet.", 403);
  }

  // The owner acts as that outlet's admin through its existing membership
  // row, so the tenant JWT is byte-identical to the one its own admin gets.
  const membership = await User.findOne({ organizationId, role: "business_admin" });
  if (!membership) {
    throw createHttpError("This outlet has no admin account yet.", 404);
  }

  const company = await Company.findOne({ _id: companyId });
  return {
    ...formatAuthPayload(membership),
    companySlug: company.slug,
    outletSlug: outlet.slug
  };
};

const getCompany = async (companyId) => {
  const company = await Company.findOne({ _id: companyId });
  if (!company) throw createHttpError("Company not found.", 404);
  return company;
};

module.exports = {
  createHttpError,
  assertEmailAvailable,
  sendAdminVerifyEmail,
  buildAdminAuthLink,
  hashToken,
  normalizeEmail,
  normalizeSlug,
  formatCompany,
  formatOutlet,
  createCompany,
  createOutlet,
  listOutlets,
  archiveOutlet,
  restoreOutlet,
  enterOutlet,
  getCompany
};
