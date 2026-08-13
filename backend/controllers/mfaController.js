const mfaService = require("../services/mfaService");
const { verifyGlobalSession } = require("../middleware/customerAuthMiddleware");

const assertMfaAvailable = (req, res, next) => {
  if (process.env.ENABLE_MFA !== "true") {
    const error = new Error("MFA is not enabled on this platform.");
    error.statusCode = 404;
    return next(error);
  }
  next();
};

const setup = async (req, res, next) => {
  try {
    const result = await mfaService.setup({
      accountId: req.customerAccount.id,
      accountType: "customer"
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const enable = async (req, res, next) => {
  try {
    const result = await mfaService.enable({
      accountId: req.customerAccount.id,
      accountType: "customer",
      otpauthUri: req.body.otpauthUri
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const disable = async (req, res, next) => {
  try {
    const result = await mfaService.disable({
      accountId: req.customerAccount.id,
      accountType: "customer",
      code: req.body.code,
      password: req.body.password
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const status = async (req, res, next) => {
  try {
    const result = await mfaService.mfaStatus({
      accountId: req.customerAccount.id,
      accountType: "customer"
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// POST /api/account/login/mfa — second step after a needsMfa login response.
const completeMfaLogin = async (req, res, next) => {
  try {
    const { completeMfaLogin: complete } = require("../services/customerAccountService");
    const result = await complete({
      challengeToken: req.body.challengeToken,
      code: req.body.code
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { assertMfaAvailable, setup, enable, disable, status, completeMfaLogin, verifyGlobalSession };
