const {
  adminLogin,
  verifyAdminEmail,
  verifyAdminOtp,
  resendAdminVerification,
  forgotAdminPassword,
  resetAdminPassword
} = require("../services/adminAuthService");

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await adminLogin({ email, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const result = await verifyAdminEmail({ token: req.query.token });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const result = await verifyAdminOtp({ email, code });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resendVerification = async (req, res, next) => {
  try {
    const result = await resendAdminVerification({ email: req.body.email });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const result = await forgotAdminPassword({ email: req.body.email });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const result = await resetAdminPassword({ token, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { login, verifyEmail, verifyOtp, resendVerification, forgotPassword, resetPassword };
