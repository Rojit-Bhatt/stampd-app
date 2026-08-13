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

// Minting carries the account's sessionVersion into the signed payload so a
// verifier with the live row can tell a stale token (password changed after
// it was minted) from a fresh one. `sessionVersion` defaults to 0 so callers
// that never pass it — tests, migration-free paths — keep producing tokens
// that match a row at version 0.
const generateAuthToken = (payload, { sessionVersion = 0 } = {}) => {
  return jwt.sign({ ...payload, sessionVersion }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
};

// Throws "Session expired" (statusCode 401) when the token is cryptographically
// valid but the account has since revoked it — password change, forced logout,
// staff deactivation. `row` is the live mongoose document re-fetched by the
// middleware on every request; null skips the revocation check (the mock-DB
// test paths that never re-fetch, and callers that only need crypto validity).
// Missing sessionVersion on either side is treated as 0, so tokens minted
// before this change stay valid until they naturally expire.
const verifyAuthToken = (token, row) => {
  const decoded = jwt.verify(token, getJwtSecret());
  if (row && (decoded.sessionVersion ?? 0) !== (row.sessionVersion ?? 0)) {
    const err = new Error("Session expired");
    err.statusCode = 401;
    throw err;
  }
  return decoded;
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
const generateGlobalSessionToken = ({ customerAccountId, sessionVersion = 0 }) => {
  return jwt.sign({ type: "global_customer", customerAccountId, sessionVersion }, getGlobalJwtSecret(), {
    // Was 60d — halved because a global token is the master key to every
    // tenant a customer belongs to; sessionVersion gives instant revocation
    // but a shorter life is cheap defence in depth while it's fresh.
    expiresIn: process.env.GLOBAL_SESSION_EXPIRES_IN || "30d"
  });
};

const verifyGlobalSessionToken = (token, row) => {
  const decoded = jwt.verify(token, getGlobalJwtSecret());
  if (row && (decoded.sessionVersion ?? 0) !== (row.sessionVersion ?? 0)) {
    const err = new Error("Session expired");
    err.statusCode = 401;
    throw err;
  }
  return decoded;
};

// Same global-session shape/secret as generateGlobalSessionToken above, but
// for a company owner's AdminAccount instead of a CustomerAccount — {type,
// adminAccountId, companyId}, disambiguated by `type` so the two can share
// JWT_GLOBAL_SECRET without ever being confused for one another. Like the
// customer global token, this can never satisfy authMiddleware.verifyToken's
// userId/role check, so it can never grant tenant access directly — only
// exchange for a tenant JWT via /api/company/enter-outlet.
const generateCompanySessionToken = ({ adminAccountId, companyId, sessionVersion = 0 }) => {
  return jwt.sign({ type: "company_owner", adminAccountId, companyId, sessionVersion }, getGlobalJwtSecret(), {
    // Same 60d→30d halving as generateGlobalSessionToken — see its comment.
    expiresIn: process.env.GLOBAL_SESSION_EXPIRES_IN || "30d"
  });
};

const verifyCompanySessionToken = (token, row) => {
  const decoded = jwt.verify(token, getGlobalJwtSecret());
  if (row && (decoded.sessionVersion ?? 0) !== (row.sessionVersion ?? 0)) {
    const err = new Error("Session expired");
    err.statusCode = 401;
    throw err;
  }
  return decoded;
};

module.exports = {
  generateAuthToken,
  verifyAuthToken,
  generateGlobalSessionToken,
  verifyGlobalSessionToken,
  generateCompanySessionToken,
  verifyCompanySessionToken
};
