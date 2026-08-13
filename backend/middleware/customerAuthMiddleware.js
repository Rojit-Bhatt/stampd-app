const { verifyGlobalSessionToken } = require("../utils/tokenUtils");
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

    // Re-fetch on every request, same revocation posture as verifyToken.
    const account = await CustomerAccount.findOne({ _id: decoded.customerAccountId });

    if (!account) {
      const error = new Error("Access denied. Session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    // Session-version check: a password change bumps the account's
    // sessionVersion, so a previously-issued global token — still within its
    // 30d lifetime — is rejected here with "Session expired" 401 on the very
    // next request. No token list, no refresh dance, instant logout.
    verifyGlobalSessionToken(token, account);

    req.customerAccount = { id: decoded.customerAccountId };

    next();
  } catch (error) {
    error.statusCode = 401;
    next(error);
  }
};

module.exports = { verifyGlobalSession };
