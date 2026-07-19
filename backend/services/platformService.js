const bcrypt = require("bcryptjs");
const Company = require("../models/Company");
const Organization = require("../models/Organization");
const AdminAccount = require("../models/AdminAccount");
const User = require("../models/User");
const PointsTransaction = require("../models/PointsTransaction");
const { toPoints } = require("../utils/pointsMath");
const { generateAuthToken } = require("../utils/tokenUtils");
const { BUSINESS_CATEGORIES } = require("../config/platform");
const { logAction } = require("./platformAuditService");
const { sanitizeProgramInput } = require("./programService");
const companyService = require("./companyService");
const { startTrialSubscription } = require("./subscriptionService");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const buildOutletStats = async (outlet) => {
  const customersCount = (
    await User.find({ organizationId: outlet._id, role: "customer" })
  ).length;
  const txns = await PointsTransaction.find({ organizationId: outlet._id });

  const pointsIssuedCenti = txns
    .filter((t) => t.type === "earn")
    .reduce((sum, t) => sum + t.pointsCenti, 0);
  const redemptionCount = txns.filter((t) => t.type === "redeem").length;

  return {
    id: outlet._id.toString(),
    name: outlet.name,
    slug: outlet.slug,
    status: outlet.status,
    category: outlet.category,
    branding: outlet.branding,
    menuEnabled: outlet.menuEnabled,
    customersCount,
    pointsIssued: toPoints(pointsIssuedCenti),
    redemptionCount
  };
};

// A company row for the platform console, with its outlets nested and the
// per-outlet numbers rolled up.
const buildCompanyStats = async (company) => {
  const outlets = await Organization.find({ companyId: company._id });
  const outletRows = await Promise.all(outlets.map(buildOutletStats));
  const owner = await AdminAccount.findOne({ companyId: company._id, kind: "company_owner" });

  const totals = outletRows.reduce(
    (acc, o) => ({
      customersCount: acc.customersCount + o.customersCount,
      pointsIssued: acc.pointsIssued + o.pointsIssued,
      redemptionCount: acc.redemptionCount + o.redemptionCount
    }),
    { customersCount: 0, pointsIssued: 0, redemptionCount: 0 }
  );

  return {
    id: company._id.toString(),
    name: company.name,
    slug: company.slug,
    status: company.status,
    branding: company.branding,
    // The values every outlet under this company inherits. Exposed so the
    // platform console can show what they currently are — a PATCH endpoint
    // with no way to read the present value is a form you fill in blind.
    programDefaults: company.programDefaults,
    owner: owner ? { name: owner.name, email: owner.email, emailVerified: owner.emailVerified } : null,
    outlets: outletRows.sort((a, b) => a.name.localeCompare(b.name)),
    outletCount: outletRows.filter((o) => o.status !== "archived").length,
    ...totals
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

const listCompanies = async () => {
  const companies = await Company.find({});
  const rows = await Promise.all(companies.map(buildCompanyStats));
  return { success: true, companies: rows.sort((a, b) => a.name.localeCompare(b.name)) };
};

// The platform registers a company and its owner; the company then registers
// its own outlets. Every new company starts on a trial subscription, so it
// can stand up its first outlet immediately.
const registerCompany = async ({ name, slug, ownerName, ownerEmail, ownerPassword, phone, programDefaults, actorId, actorName }) => {
  const { company, owner } = await companyService.createCompany({
    name, slug, ownerName, ownerEmail, ownerPassword, phone, programDefaults
  });

  await startTrialSubscription(company._id);

  await logAction({
    actorId,
    actorName,
    action: "onboard",
    organizationId: null,
    targetName: company.name,
    details: `Company registered with owner ${owner.email}`
  });

  return {
    success: true,
    company: await buildCompanyStats(company),
    owner: { email: owner.email },
    companyPath: `/${company.slug}`
  };
};

const getCompanyById = async (id) => {
  const company = await Company.findOne({ _id: id });
  if (!company) throw createHttpError("Company not found.", 404);
  return { success: true, company: await buildCompanyStats(company) };
};

const updateCompany = async (id, { name, status, ownerEmail, programDefaults, actorId, actorName }) => {
  const company = await Company.findOne({ _id: id });
  if (!company) throw createHttpError("Company not found.", 404);

  if (status !== undefined && status !== "active" && status !== "suspended") {
    throw createHttpError("status must be either 'active' or 'suspended'.", 400);
  }

  // The inheritance root, editable after registration — without this a
  // company's earn rate was fixed at creation and could never be changed by
  // anyone, so every outlet under it inherited 100% forever.
  const program = sanitizeProgramInput(programDefaults, { label: "programDefaults" });

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (status !== undefined) updates.status = status;
  if (program) {
    // Merged, not replaced: a caller sending only earnPercent must not wipe
    // pointsExpiryDays. Assigned as a whole object because the mock DB turns
    // a dotted $set into a literal "programDefaults.earnPercent" key rather
    // than nesting (see programService's note on nested paths).
    updates.programDefaults = { ...company.programDefaults, ...program };
  }

  const updated = Object.keys(updates).length
    ? await Company.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true })
    : company;

  let ownerResult = null;
  let ownerEmailChanged = false;

  if (ownerEmail !== undefined) {
    const normalized = normalizeEmail(ownerEmail);
    const owner = await AdminAccount.findOne({ companyId: id, kind: "company_owner" });
    if (!owner) throw createHttpError("This company has no owner account to update.", 404);

    if (owner.email !== normalized) {
      await companyService.assertEmailAvailable(normalized);
      const updatedOwner = await AdminAccount.findOneAndUpdate(
        { _id: owner._id },
        { $set: { email: normalized, emailVerified: false } },
        { new: true }
      );
      await companyService.sendAdminVerifyEmail(updatedOwner);
      ownerResult = { email: updatedOwner.email };
      ownerEmailChanged = true;
    } else {
      ownerResult = { email: owner.email };
    }
  }

  const changeParts = [];
  if (updates.name !== undefined) changeParts.push(`name → "${updates.name}"`);
  if (ownerEmailChanged) changeParts.push(`owner email → ${ownerResult.email}`);
  if (program) {
    changeParts.push(
      `program defaults → ${Object.entries(program).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  }

  if (status !== undefined) {
    await logAction({
      actorId, actorName,
      action: status === "suspended" ? "suspend" : "reactivate",
      organizationId: null,
      targetName: updated.name,
      details: changeParts.join("; ")
    });
  } else if (changeParts.length) {
    await logAction({
      actorId, actorName, action: "edit", organizationId: null,
      targetName: updated.name, details: changeParts.join("; ")
    });
  }

  return {
    success: true,
    company: await buildCompanyStats(updated),
    ...(ownerResult ? { owner: ownerResult } : {})
  };
};

// The platform can also edit an individual outlet inside a company.
const updateOutlet = async (outletId, { name, category, status, actorId, actorName }) => {
  const outlet = await Organization.findOne({ _id: outletId });
  if (!outlet) throw createHttpError("Outlet not found.", 404);

  if (status !== undefined && !["active", "suspended", "archived"].includes(status)) {
    throw createHttpError("status must be 'active', 'suspended', or 'archived'.", 400);
  }
  if (category !== undefined && !BUSINESS_CATEGORIES.includes(category)) {
    throw createHttpError("Not a valid category.", 400);
  }

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (category !== undefined) updates.category = category;
  if (status !== undefined) updates.status = status;

  const updated = await Organization.findOneAndUpdate({ _id: outletId }, { $set: updates }, { new: true });

  const changeParts = [];
  if (updates.name !== undefined) changeParts.push(`name → "${updates.name}"`);
  if (updates.category !== undefined) changeParts.push(`category → ${updates.category}`);

  if (status !== undefined) {
    await logAction({
      actorId, actorName,
      action: status === "suspended" ? "suspend" : "reactivate",
      organizationId: outletId,
      targetName: updated.name,
      details: changeParts.join("; ")
    });
  } else if (changeParts.length) {
    await logAction({
      actorId, actorName, action: "edit", organizationId: outletId,
      targetName: updated.name, details: changeParts.join("; ")
    });
  }

  return { success: true, outlet: await buildOutletStats(updated) };
};

module.exports = {
  createHttpError,
  loginPlatformAdmin,
  listCompanies,
  registerCompany,
  getCompanyById,
  updateCompany,
  updateOutlet,
  buildCompanyStats,
  buildOutletStats
};
