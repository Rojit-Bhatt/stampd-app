const { listPublicCampaigns } = require("../services/campaignService");
const {
  generateQRToken,
  generateRedeemToken,
  claimPoints,
  redeemPoints,
  getRedeemCatalog,
  getPointsBalanceByUserId,
  getPointsHistoryByUserId,
  getOutletTransactions,
  getCustomerDetailRows
} = require("../services/pointsService");

const generateAdminQRToken = async (req, res, next) => {
  try {
    const result = await generateQRToken(req.user.id, req.user.organizationId, req.body.billAmount);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const generateAdminRedeemToken = async (req, res, next) => {
  try {
    const result = await generateRedeemToken(req.user.id, req.user.organizationId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const claimCustomerPoints = async (req, res, next) => {
  try {
    const result = await claimPoints({
      token: req.body.token,
      userId: req.user.id,
      role: req.user.role,
      organizationId: req.user.organizationId
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const redeemCustomerPoints = async (req, res, next) => {
  try {
    const result = await redeemPoints({
      token: req.body.token,
      itemId: req.body.itemId,
      kind: req.body.kind,
      userId: req.user.id,
      role: req.user.role,
      organizationId: req.user.organizationId
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getCatalog = async (req, res, next) => {
  try {
    const data = await getRedeemCatalog(req.user.organizationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// What's on and what's coming, for the customer's dashboard. Never the
// switched-off ones.
const getCampaigns = async (req, res, next) => {
  try {
    const data = await listPublicCampaigns(req.user.organizationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getBalance = async (req, res, next) => {
  try {
    const result = await getPointsBalanceByUserId(req.user.id, req.user.organizationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const result = await getPointsHistoryByUserId(req.user.id, req.user.organizationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// The admin-facing outlet ledger — every movement, every customer.
const getTransactions = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await getOutletTransactions(req.user.organizationId, {
      limit: startDate || endDate ? 5000 : undefined,
      startDate,
      endDate
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getCustomersList = async (req, res, next) => {
  try {
    const data = await getCustomerDetailRows(req.user.organizationId);

    data.sort((a, b) => {
      const dateA = a.lastActivityAt ? new Date(a.lastActivityAt) : new Date(0);
      const dateB = b.lastActivityAt ? new Date(b.lastActivityAt) : new Date(0);
      return dateB - dateA;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateAdminQRToken,
  generateAdminRedeemToken,
  claimCustomerPoints,
  redeemCustomerPoints,
  getCatalog,
  getCampaigns,
  getBalance,
  getHistory,
  getTransactions,
  getCustomersList
};
