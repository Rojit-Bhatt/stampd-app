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
  if (!newPassword) {
    throw createHttpError("New password is required.", 400);
  }
  if (newPassword.length < 8) {
    throw createHttpError("New password must be at least 8 characters.", 400);
  }

  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);

  if (user.password) {
    if (!currentPassword) {
      throw createHttpError("Current password is required.", 400);
    }
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw createHttpError("Current password is incorrect.", 401);
    }
  }
  // else: Google-only sign-in, nothing to compare against — the
  // authenticated session is proof enough to set a first password.

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  // Credential-version kill: every JWT minted under the old passwordVersion
  // is rejected from the next request (tenant JWT for business_admin rows
  // carrying a password, platform JWT for platform rows).
  user.passwordVersion = (user.passwordVersion || 0) + 1;
  await user.save();

  // Alert: same owner-notification contract as the customer/admin flows.
  if (user.email) {
    const { sendEmail } = require("./emailService");
    sendEmail({
      to: user.email,
      subject: "Your password was changed",
      html: `<p>Your password was just changed.</p><p>If that wasn't you, contact your platform admin right away — your sessions are already dead, but an attacker who got this far should be blocked before they try anything else.</p>`
    }).catch((err) => console.error(`Failed to email password-change alert to ${user.email}:`, err.message));
  }

  return { success: true, message: "Password updated." };
};

module.exports = {
  getAccount,
  updateProfile,
  dismissInfoPrompt,
  changePassword
};
