const bcrypt = require("bcryptjs");
const User = require("../models/User");
const CustomerAccount = require("../models/CustomerAccount");

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

  const trimmedName = name.trim();

  // For a customer, CustomerAccount.name is the source of truth —
  // ensureMembership re-syncs every User.name from it on every enter-tenant
  // call, so writing only the User row here would have the edit silently
  // reverted on the customer's next tenant visit.
  if (user.role === "customer" && user.customerAccountId) {
    await CustomerAccount.updateOne({ _id: user.customerAccountId }, { name: trimmedName });
  }

  user.name = trimmedName;
  await user.save();
  return user;
};

const dismissInfoPrompt = async (userId) => {
  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);
  user.infoPromptDismissed = true;
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
  dismissInfoPrompt,
  changePassword
};
