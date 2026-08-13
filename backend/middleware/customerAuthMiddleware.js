const { verifyGlobalSessionToken, tokenPv } = require("../utils/tokenUtils");
const CustomerAccount = require("../models/CustomerAccount");

// Duplicated from authMiddleware.js's extractToken rather than imported —
// authMiddleware.js is deliberately left untouched by this feature (it still
// serves business_admin/platform login and must not risk any regression).
const extractToken = (req) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  if (req.headers["x-access-token"]) {
    return req.headers["x-access-token"];
  }

  if (req.headers.token) {
    return req.headers.token;
  }

  return null;
};

// Verifies a global session token (proves "you are this CustomerAccount"
// across every tenant) — structurally and cryptographically distinct from a
// tenant JWT, so this must never be confused with authMiddleware.verifyToken.
const verifyGlobalSession = async (req, _res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      const error = new Error("Access denied. Token is required.");
      error.statusCode = 401;
      throw error;
    }

    const decoded = verifyGlobalSessionToken(token);

    if (decoded.type !== "global_customer" || !decoded.customerAccountId) {
      const error = new Error("Invalid session.");
      error.statusCode = 401;
      throw error;
    }

    // Re-fetch on every request, same revocation posture as verifyToken —
    // and also enforce the credential version: a password change or reset
    // bumps the account's passwordVersion, so any session minted under the
    // old version dies immediately. tokenPv() treats legacy tokens with no
    // `pv` claim as version 0, matching every account's default version,
    // so existing sessions keep working until the next credential change.
    const account = await CustomerAccount.findOne({ _id: decoded.customerAccountId });

    if (!account) {
      const error = new Error("Access denied. Session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    // The row carries `passwordVersion`; the token carries the matching `pv`
    // claim (see utils/tokenUtils). tokenPv() on the decoded token is used
    // for the token side only — passing the Mongoose row to it would always
    // read 0 (rows have no `pv` field) and silently let stale sessions through.
    const rowPv = typeof account.passwordVersion === "number" ? account.passwordVersion : 0;
    if (rowPv > tokenPv(decoded)) {
      const error = new Error("Access denied. Session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    req.customerAccount = { id: decoded.customerAccountId };

    next();
  } catch (error) {
    error.statusCode = 401;
    next(error);
  }
};

module.exports = { verifyGlobalSession };
