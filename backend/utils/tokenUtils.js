const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  // Never allow an unset secret in production — fail loudly instead.
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production.");
  }

  // Dev-only convenience so `npm run dev` works with zero configuration.
  return "dev_only_insecure_jwt_secret_change_me";
};

const generateAuthToken = (payload) => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
};

const verifyAuthToken = (token) => {
  return jwt.verify(token, getJwtSecret());
};

module.exports = {
  generateAuthToken,
  verifyAuthToken
};
