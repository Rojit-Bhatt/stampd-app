const {
  registerUser, loginUser, authenticateWithGoogle,
  verifyEmail, resendVerification, forgotPassword, resetPassword, completeProfile
} = require("../services/authService");

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, address } = req.body;
    const result = await registerUser({
      name, email, password, phone, address,
      organizationId: req.organizationId, slug: req.organization.slug
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser({ email, password, organizationId: req.organizationId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const result = await authenticateWithGoogle({ idToken, organizationId: req.organizationId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const verifyEmailController = async (req, res, next) => {
  try {
    const result = await verifyEmail({ token: req.query.token, organizationId: req.organizationId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resendVerificationController = async (req, res, next) => {
  try {
    const result = await resendVerification({
      email: req.body.email, organizationId: req.organizationId, slug: req.organization.slug
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const forgotPasswordController = async (req, res, next) => {
  try {
    const result = await forgotPassword({
      email: req.body.email, organizationId: req.organizationId, slug: req.organization.slug
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const resetPasswordController = async (req, res, next) => {
  try {
    const result = await resetPassword({
      token: req.body.token, password: req.body.password, organizationId: req.organizationId
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const completeProfileController = async (req, res, next) => {
  try {
    const result = await completeProfile({
      userId: req.user.id, organizationId: req.user.organizationId,
      phone: req.body.phone, address: req.body.address
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
  completeProfile: completeProfileController
};
