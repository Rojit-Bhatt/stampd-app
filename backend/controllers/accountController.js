const { getAccount, updateProfile, changePassword } = require("../services/accountService");

const formatAccount = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified
});

const getMe = async (req, res, next) => {
  try {
    const user = await getAccount(req.user.id);
    res.status(200).json({ success: true, ...formatAccount(user) });
  } catch (error) {
    next(error);
  }
};

const updateProfileController = async (req, res, next) => {
  try {
    const user = await updateProfile(req.user.id, req.body);
    res.status(200).json({ success: true, ...formatAccount(user) });
  } catch (error) {
    next(error);
  }
};

const changePasswordController = async (req, res, next) => {
  try {
    const result = await changePassword(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMe,
  updateProfileController,
  changePasswordController
};
