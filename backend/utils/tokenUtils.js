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

const getGlobalJwtSecret = () => {
  if (process.env.JWT_GLOBAL_SECRET) {
    return process.env.JWT_GLOBAL_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_GLOBAL_SECRET must be set in production.");
  }

  return "dev_only_insecure_global_jwt_secret_change_me";
};

// A global session token proves "you are this CustomerAccount" across every
// tenant, distinct from a tenant JWT in both secret and payload shape
// ({type, customerAccountId} — no userId/role/organizationId). This means a
// global token can never satisfy authMiddleware.verifyToken's
// `if (!decoded.userId || !decoded.role)` check even before considering it's
// signed with a different secret entirely — it can never grant tenant access
// on its own, only exchange for a tenant JWT via the enter-tenant endpoint.
const generateGlobalSessionToken = ({ customerAccountId }) => {
  return jwt.sign({ type: "global_customer", customerAccountId }, getGlobalJwtSecret(), {
    expiresIn: process.env.GLOBAL_SESSION_EXPIRES_IN || "60d"
  });
};

const verifyGlobalSessionToken = (token) => {
  return jwt.verify(token, getGlobalJwtSecret());
};

// Same global-session shape/secret as generateGlobalSessionToken above, but
// for a BusinessOwnerAccount instead of a CustomerAccount — {type,
// ownerAccountId}, disambiguated by `type` so the two can share
// JWT_GLOBAL_SECRET without ever being confused for one another. Like the
// customer global token, this can never satisfy authMiddleware.verifyToken's
// userId/role check, so it can never grant tenant access directly — only
// exchange for a tenant JWT via /api/owner/enter-business.
const generateOwnerSessionToken = ({ ownerAccountId }) => {
  return jwt.sign({ type: "global_owner", ownerAccountId }, getGlobalJwtSecret(), {
    expiresIn: process.env.GLOBAL_SESSION_EXPIRES_IN || "60d"
  });
};

const verifyOwnerSessionToken = (token) => {
  return jwt.verify(token, getGlobalJwtSecret());
};

module.exports = {
  generateAuthToken,
  verifyAuthToken,
  generateGlobalSessionToken,
  verifyGlobalSessionToken,
  generateOwnerSessionToken,
  verifyOwnerSessionToken
};
