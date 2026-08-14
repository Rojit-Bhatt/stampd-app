const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  // Never allow an unset secret in production — fail loudly instead.
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production.");
  }

  // Hardcoded dev keys are no longer in source. Run `cp backend/.env.example
  // backend/.env` once so `npm run dev` works with zero configuration;
  // the example file carries a deliberately weak dev value that never enters
  // the git history as an active secret.
  throw new Error(
    "JWT_SECRET is not set — copy backend/.env.example to backend/.env and fill it in."
  );
};

// Wraps format-time calls — every tenant JWT carries the credential version
// the token was minted under, so verification (see authMiddleware and the
// global/company session middleware) can reject a token the moment its owner
// changes a password or resets credentials. `pv` missing (older tokens) is
// treated as 0, which is exactly every account's default version — so
// existing sessions stay valid until the next credential change.
const generateAuthToken = (payload, pv = 0) => {
  return jwt.sign({ ...payload, pv }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
};

// Short-lived MFA challenge token (10 minutes): proves the password was
// right at login so the second step can issue the real session without
// re-asking for the password. 10 minutes is tight enough that a stolen
// challenge token has a narrow window, long enough for a human to reach
// their authenticator.
const generateMfaChallengeToken = (payload, pv = 0) => {
  return jwt.sign({ ...payload, pv }, getJwtSecret(), {
    expiresIn: process.env.MFA_CHALLENGE_EXPIRES_IN || "10m"
  });
};

// Signature verification only — caller middleware also enforces the
// password-version check against the database row.
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

  throw new Error(
    "JWT_GLOBAL_SECRET is not set — copy backend/.env.example to backend/.env and fill it in."
  );
};

// A global session token proves "you are this CustomerAccount" across every
// tenant, distinct from a tenant JWT in both secret and payload shape
// ({type, customerAccountId} — no userId/role/organizationId). This means a
// global token can never satisfy authMiddleware.verifyToken's
// `if (!decoded.userId || !decoded.role)` check even before considering it's
// signed with a different secret entirely — it can never grant tenant access
// on its own, only exchange for a tenant JWT via the enter-tenant endpoint.
const generateGlobalSessionToken = ({ customerAccountId, pv = 0 }) => {
  return jwt.sign({ type: "global_customer", customerAccountId, pv }, getGlobalJwtSecret(), {
    // 14 days, not 60: a leaked global session should stop being useful
    // within a reasonable window even without a credential change. Overridable
    // with GLOBAL_SESSION_EXPIRES_IN; the value ships via the deployment env,
    // not a code default change at runtime.
    expiresIn: process.env.GLOBAL_SESSION_EXPIRES_IN || "14d"
  });
};

const verifyGlobalSessionToken = (token) => {
  return jwt.verify(token, getGlobalJwtSecret());
};

// Same global-session shape/secret as generateGlobalSessionToken above, but
// for a company owner's AdminAccount instead of a CustomerAccount — {type,
// adminAccountId, companyId}, disambiguated by `type` so the two can share
// JWT_GLOBAL_SECRET without ever being confused for one another. Like the
// customer global token, this can never satisfy authMiddleware.verifyToken's
// userId/role check, so it can never grant tenant access directly — only
// exchange for a tenant JWT via /api/company/enter-outlet.
const generateCompanySessionToken = ({ adminAccountId, companyId, pv = 0 }) => {
  return jwt.sign({ type: "company_owner", adminAccountId, companyId, pv }, getGlobalJwtSecret(), {
    expiresIn: process.env.GLOBAL_SESSION_EXPIRES_IN || "14d"
  });
};

const verifyCompanySessionToken = (token) => {
  return jwt.verify(token, getGlobalJwtSecret());
};

// Credential-change guards.
//
// A token's `pv` claim is compared against the account row's passwordVersion.
// A mismatch means the credentials were changed AFTER this token was minted —
// treat it as expired. Tokens issued before this feature (no `pv` claim)
// decode to pv = 0, and every account defaults to version 0, so nothing
// breaks until the FIRST credential change on the account.
const tokenPv = (decoded) => (decoded && typeof decoded.pv === "number" ? decoded.pv : 0);

// Resolves a global-session token's decoded payload to the owning row's
// current version — one cached-free lookup, same pattern the global session
// middleware already does on every request.
const pvCheck = async (decoded, { customerAccountId, adminAccountId }) => {
  if (!decoded) return false;
  const neededPv = tokenPv(decoded);
  let row = null;
  if (customerAccountId) {
    const CustomerAccount = require("../models/CustomerAccount");
    row = await CustomerAccount.findOne({ _id: customerAccountId });
  } else if (adminAccountId) {
    const AdminAccount = require("../models/AdminAccount");
    row = await AdminAccount.findOne({ _id: adminAccountId });
  }
  if (!row) return false;
  return tokenPv(row) <= neededPv;
};

module.exports = {
  generateAuthToken,
  generateMfaChallengeToken,
  verifyAuthToken,
  generateGlobalSessionToken,
  verifyGlobalSessionToken,
  generateCompanySessionToken,
  verifyCompanySessionToken,
  tokenPv,
  pvCheck
};
