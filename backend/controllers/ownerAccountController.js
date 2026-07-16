const {
  registerOwnerAccount,
  loginOwnerAccount,
  verifyOwnerEmail,
  resendOwnerVerification,
  forgotOwnerPassword,
  resetOwnerPassword,
  enterBusiness,
  getMyBusinesses,
  createBusinessForOwner
} = require("../services/ownerAccountService");
const { getSubscriptionSummary } = require("../services/subscriptionService");
const { redeemKey } = require("../services/subscriptionKeyService");

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    const result = await registerOwnerAccount({ name, email, password, phone });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginOwnerAccount({ email, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    const result = await verifyOwnerEmail({ token });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await resendOwnerVerification({ email });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await forgotOwnerPassword({ email });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const result = await resetOwnerPassword({ token, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const enterBusinessHandler = async (req, res, next) => {
  try {
    const { organizationId } = req.body;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: "organizationId is required." });
    }
    const result = await enterBusiness({ ownerAccountId: req.ownerAccount.id, organizationId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getMyBusinessesHandler = async (req, res, next) => {
  try {
    const result = await getMyBusinesses({ ownerAccountId: req.ownerAccount.id });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postBusiness = async (req, res, next) => {
  try {
    const { name, slug, category } = req.body;
    const result = await createBusinessForOwner({ ownerAccountId: req.ownerAccount.id, name, slug, category });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const getSubscription = async (req, res, next) => {
  try {
    const result = await getSubscriptionSummary(req.ownerAccount.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const redeemMyKey = async (req, res, next) => {
  try {
    const { code } = req.body;
    const result = await redeemKey({ code, ownerAccountId: req.ownerAccount.id });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  enterBusinessHandler,
  getMyBusinessesHandler,
  postBusiness,
  getSubscription,
  redeemMyKey
};
