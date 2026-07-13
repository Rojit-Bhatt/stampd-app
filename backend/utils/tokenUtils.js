const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    return "super_secret_cafe_token_key_12345_fallback";
  }

  return process.env.JWT_SECRET;
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
