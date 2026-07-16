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
const { getPlatformAnalytics } = require("../services/platformAnalyticsService");
const User = require("../models/User");

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
    const { name, slug, ownerName, ownerEmail, ownerPassword, phone } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await registerCompany({
      name,
      slug,
      ownerName,
      ownerEmail,
      ownerPassword,
      phone,
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
    const { name, status, ownerEmail } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await updateCompany(req.params.id, {
      name,
      status,
      ownerEmail,
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
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

const patchPlatformContact = async (req, res, next) => {
  try {
    const contact = await updateContact(req.body || {});
    res.status(200).json({ success: true, contact });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  platformLogin,
  getCompanies,
  postCompany,
  getCompany,
  patchCompany,
  patchOutlet,
  getAuditLog,
  getAnalytics,
  getPublicPlatformContact,
  getPlatformContactAdmin,
  patchPlatformContact
};
