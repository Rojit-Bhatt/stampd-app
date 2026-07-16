const { verifyCompanySessionToken } = require("../utils/tokenUtils");
const AdminAccount = require("../models/AdminAccount");

// Duplicated from authMiddleware.js's extractToken rather than imported —
// same reasoning as customerAuthMiddleware.js: authMiddleware serves the
// tenant/platform JWTs and is deliberately left untouched by the company
// layer.
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

// Verifies a company-owner session token (proves "you own this company")
// — structurally and cryptographically distinct from a tenant JWT, mirrors
// customerAuthMiddleware.verifyGlobalSession exactly.
const verifyCompanySession = async (req, _res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      const error = new Error("Access denied. Token is required.");
      error.statusCode = 401;
      throw error;
    }

    const decoded = verifyCompanySessionToken(token);

    if (decoded.type !== "company_owner" || !decoded.adminAccountId) {
      const error = new Error("Invalid session.");
      error.statusCode = 401;
      throw error;
    }

    // Re-fetch on every request, same revocation posture as verifyToken /
    // verifyGlobalSession — and re-read companyId from the row rather than
    // trusting the token, so a reassignment takes effect immediately.
    const account = await AdminAccount.findOne({ _id: decoded.adminAccountId });

    if (!account || account.kind !== "company_owner") {
      const error = new Error("Access denied. Session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    req.adminAccount = { id: decoded.adminAccountId, kind: account.kind };
    req.companyId = account.companyId.toString();

    next();
  } catch (error) {
    error.statusCode = 401;
    next(error);
  }
};

module.exports = { verifyCompanySession };
