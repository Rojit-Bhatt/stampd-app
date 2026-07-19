const {
  createOutlet,
  listOutlets,
  archiveOutlet,
  restoreOutlet,
  enterOutlet,
  getCompany,
  formatCompany
} = require("../services/companyService");
const { getSubscriptionSummary } = require("../services/subscriptionService");
const { redeemKey } = require("../services/subscriptionKeyService");
const { getCompanyRollup } = require("../services/companyReportService");

const getMyCompany = async (req, res, next) => {
  try {
    const company = await getCompany(req.companyId);
    res.status(200).json({ success: true, company: formatCompany(company) });
  } catch (error) {
    next(error);
  }
};

const getOutlets = async (req, res, next) => {
  try {
    const outlets = await listOutlets(req.companyId);
    res.status(200).json({ success: true, outlets });
  } catch (error) {
    next(error);
  }
};

const postOutlet = async (req, res, next) => {
  try {
    const { name, slug, category, adminName, adminEmail, adminPassword } = req.body;
    const { organization } = await createOutlet({
      companyId: req.companyId, name, slug, category, adminName, adminEmail, adminPassword
    });
    const company = await getCompany(req.companyId);
    res.status(201).json({
      success: true,
      outlet: { id: organization._id.toString(), slug: organization.slug, name: organization.name },
      outletPath: `/${company.slug}/${organization.slug}/admin`
    });
  } catch (error) {
    next(error);
  }
};

const deleteOutlet = async (req, res, next) => {
  try {
    const result = await archiveOutlet({ companyId: req.companyId, outletId: req.params.id });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postRestoreOutlet = async (req, res, next) => {
  try {
    const result = await restoreOutlet({ companyId: req.companyId, outletId: req.params.id });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postEnterOutlet = async (req, res, next) => {
  try {
    const { organizationId } = req.body;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: "organizationId is required." });
    }
    const result = await enterOutlet({ companyId: req.companyId, organizationId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getSubscription = async (req, res, next) => {
  try {
    const result = await getSubscriptionSummary(req.companyId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postRedeemKey = async (req, res, next) => {
  try {
    const result = await redeemKey({ code: req.body.code, companyId: req.companyId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRollup = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await getCompanyRollup(req.companyId, { startDate, endDate });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyCompany,
  getOutlets,
  postOutlet,
  deleteOutlet,
  postRestoreOutlet,
  postEnterOutlet,
  getSubscription,
  postRedeemKey,
  getRollup
};
