const { registerUser, loginUser, authenticateWithGoogle } = require("../services/authService");

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

module.exports = {
  register,
  login,
  googleAuth
};
