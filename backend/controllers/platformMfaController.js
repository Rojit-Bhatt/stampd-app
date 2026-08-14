const mfaService = require("../services/mfaService");

const assertMfaAvailable = (req, res, next) => {
  if (process.env.ENABLE_MFA !== "true") {
    const error = new Error("MFA is not enabled on this platform.");
    error.statusCode = 404;
    return next(error);
  }
  next();
};

// req.user.id is the platform User row (role: platform) — that is the
// accountType "platform" contract in mfaService.
const status = async (req, res, next) => {
  try {
    const result = await mfaService.mfaStatus({
      accountId: req.user.id,
      accountType: "platform"
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const setup = async (req, res, next) => {
  try {
    const result = await mfaService.setup({
      accountId: req.user.id,
      accountType: "platform"
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const enable = async (req, res, next) => {
  try {
    const result = await mfaService.enable({
      accountId: req.user.id,
      accountType: "platform",
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
      accountId: req.user.id,
      accountType: "platform",
      code: req.body.code,
      password: req.body.password
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Second step after a platform login returning needsMfa.
const completeMfaLogin = async (req, res, next) => {
  try {
    const { completePlatformMfaLogin } = require("../services/platformService");
    const result = await completePlatformMfaLogin({
      challengeToken: req.body.challengeToken,
      code: req.body.code
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { assertMfaAvailable, status, setup, enable, disable, completeMfaLogin };
