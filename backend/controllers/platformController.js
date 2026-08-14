const {
  loginPlatformAdmin,
  listCompanies,
  registerCompany,
  getCompanyById,
  updateCompany,
  updateOutlet
} = require("../services/platformService");
const {
  getContact,
  updateContact
} = require("../services/platformConfigService");
const { listRecent } = require("../services/platformAuditService");
const { buildDigest } = require("../services/checksumService");
const { listPublicPlans } = require("../services/subscriptionPlanService");
const { getPlatformCustomers: listPlatformCustomers } = require("../services/platformCustomersService");
const {
  buildPlatformCustomersWorkbook
} = require("../services/platformAnalyticsService");
const {
  getPlatformAnalytics,
  getPlatformCompanyReportRows,
  buildPlatformCompanyReportWorkbook,
  getPublicStats: getPublicStatsService
} = require("../services/platformAnalyticsService");
const User = require("../models/User");
const { clearCache } = require("../utils/responseCache");
const Organization = require("../models/Organization");

// Company- or outlet-level writes flow into public tenant/menu output —
// purge the cached keys for every affected outlet.
const purgeCompanyTenants = async (companyId) => {
  try {
    const orgs = await Organization.find({ companyId });
    for (const org of orgs) {
      clearCache({ tenant: String(org._id), kind: "publicTenant" });
      clearCache({ tenant: String(org._id), kind: "publicMenu" });
    }
  } catch (_) {
    // Best-effort purge — a miss only costs one slow read.
  }
};

const platformLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginPlatformAdmin({ email, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getCompanies = async (req, res, next) => {
  try {
    const result = await listCompanies();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postCompany = async (req, res, next) => {
  try {
    const { name, slug, ownerName, ownerEmail, ownerPassword, phone, programDefaults } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await registerCompany({
      name,
      slug,
      ownerName,
      ownerEmail,
      ownerPassword,
      phone,
      programDefaults,
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const getCompany = async (req, res, next) => {
  try {
    const result = await getCompanyById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const patchCompany = async (req, res, next) => {
  try {
    const { name, status, ownerEmail, programDefaults, smsMonthlyCapPaisa } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await updateCompany(req.params.id, {
      name,
      status,
      ownerEmail,
      programDefaults,
      smsMonthlyCapPaisa,
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
    await purgeCompanyTenants(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// The platform can edit an individual outlet inside a company too — the
// company registers its own outlets, but the platform stays able to fix or
// suspend one.
const patchOutlet = async (req, res, next) => {
  try {
    const { name, category, status } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await updateOutlet(req.params.outletId, {
      name,
      category,
      status,
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
    // An outlet rename/category/status change affects its public tenant page.
    await clearCache({ tenant: String(req.params.outletId), kind: "publicTenant" });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getAuditLog = async (req, res, next) => {
  try {
    const entries = await listRecent(100);
    res.status(200).json({ success: true, entries });
  } catch (error) {
    next(error);
  }
};

const getAnalytics = async (req, res, next) => {
  try {
    const stats = await getPlatformAnalytics();
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
};

const downloadCompaniesReport = async (req, res, next) => {
  try {
    const { rows, start, end } = await getPlatformCompanyReportRows({
      startDate: req.query.startDate,
      endDate: req.query.endDate
    });
    const buffer = await buildPlatformCompanyReportWorkbook({ rows, start, end });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"companies-report.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

// Public — the marketing pricing section. Wiring pricing to the real plan
// catalogue is what keeps the page from promising a tier that no
// subscription key actually grants.
const getPublicPlans = async (req, res, next) => {
  try {
    const plans = await listPublicPlans();
    res.status(200).json({ success: true, plans });
  } catch (error) {
    next(error);
  }
};

// Public — the marketing landing page's hero figures. No auth by design;
// the service guarantees the payload is aggregate-only.
const getPublicStats = async (req, res, next) => {
  try {
    const stats = await getPublicStatsService();
    res.status(200).json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};

const getPublicPlatformContact = async (req, res, next) => {
  try {
    const contact = await getContact();
    res.status(200).json({ success: true, contact });
  } catch (error) {
    next(error);
  }
};

const getPlatformContactAdmin = async (req, res, next) => {
  try {
    const contact = await getContact();
    res.status(200).json({ success: true, contact });
  } catch (error) {
    next(error);
  }
};

// Platform-admin sanity digest (G11 — backups/DR): cheap deterministic
// row-count + balance checksum over the core business state, hashed so an
// operator or CI cron job can detect silent DB corruption by comparing
// against a stored baseline. Platform-admin only — the raw numbers are
// tenant-state metadata an external party must never see.
const getSanityChecksum = async (req, res, next) => {
  try {
    const digest = await buildDigest();
    res.status(200).json({ success: true, digest });
  } catch (error) {
    next(error);
  }
};

const patchPlatformContact = async (req, res, next) => {
  try {
    const contact = await updateContact(req.body || {});
    res.status(200).json({ success: true, contact });
  } catch (error) {
    next(error);
  }
};

// Every CustomerAccount ever created — verified and unverified, with and
// without an outlet membership. Identity and state only; nothing a tenant
// could not already see for its own customers.
const getPlatformCustomers = async (req, res, next) => {
  try {
    const result = await listPlatformCustomers({ search: req.query.search });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const downloadCustomersReport = async (req, res, next) => {
  try {
    const { rows } = await listPlatformCustomers({ search: req.query.search });
    const buffer = await buildPlatformCustomersWorkbook({ rows });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"customers-report.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  platformLogin,
  getSanityChecksum,
  getCompanies,
  postCompany,
  getCompany,
  patchCompany,
  patchOutlet,
  getAuditLog,
  getAnalytics,
  downloadCompaniesReport,
  getPublicStats,
  getPublicPlans,
  getPublicPlatformContact,
  getPlatformContactAdmin,
  patchPlatformContact,
  getPlatformCustomers,
  downloadCustomersReport
};
