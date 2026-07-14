const bcrypt = require("bcryptjs");
const User = require("../models/User");

const SALT_ROUNDS = 10;

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getAccount = async (userId) => {
  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);
  return user;
};

const updateProfile = async (userId, { name }) => {
  if (!name || !name.trim()) {
    throw createHttpError("Name is required.", 400);
  }

  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);

  user.name = name.trim();
  await user.save();
  return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword) {
    throw createHttpError("Current and new password are required.", 400);
  }
  if (newPassword.length < 8) {
    throw createHttpError("New password must be at least 8 characters.", 400);
  }

  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);

  if (!user.password) {
    throw createHttpError("This account signs in with Google and has no password to change.", 400);
  }

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    throw createHttpError("Current password is incorrect.", 401);
  }

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  return { success: true, message: "Password updated." };
};

module.exports = {
  getAccount,
  updateProfile,
  changePassword
};
