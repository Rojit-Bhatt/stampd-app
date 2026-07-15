const {
  registerAccount, loginAccount, authenticateWithGoogle,
  verifyAccountEmail, resendVerification, forgotPassword, resetPassword,
  completeProfile, enterTenant
} = require("../services/customerAccountService");

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, pendingClaimId } = req.body;
    const result = await registerAccount({ name, email, password, phone, pendingClaimId });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginAccount({ email, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const result = await authenticateWithGoogle({ idToken });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const verifyEmailController = async (req, res, next) => {
  try {
    const result = await verifyAccountEmail({ token: req.query.token });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resendVerificationController = async (req, res, next) => {
  try {
    const result = await resendVerification({ email: req.body.email });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const forgotPasswordController = async (req, res, next) => {
  try {
    const result = await forgotPassword({ email: req.body.email });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resetPasswordController = async (req, res, next) => {
  try {
    const result = await resetPassword({ token: req.body.token, password: req.body.password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const completeProfileController = async (req, res, next) => {
  try {
    const result = await completeProfile({
      customerAccountId: req.customerAccount.id,
      phone: req.body.phone
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const enterTenantController = async (req, res, next) => {
  try {
    const result = await enterTenant({
      customerAccountId: req.customerAccount.id,
      organizationId: req.organizationId
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  googleAuth,
  verifyEmail: verifyEmailController,
  resendVerification: resendVerificationController,
  forgotPassword: forgotPasswordController,
  resetPassword: resetPasswordController,
  completeProfile: completeProfileController,
  enterTenant: enterTenantController
};
