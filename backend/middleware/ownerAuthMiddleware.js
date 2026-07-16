const { verifyOwnerSessionToken } = require("../utils/tokenUtils");
const BusinessOwnerAccount = require("../models/BusinessOwnerAccount");

// Duplicated from authMiddleware.js's extractToken rather than imported —
// same reasoning as customerAuthMiddleware.js: this feature is deliberately
// kept from touching authMiddleware.js at all.
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

// Verifies a global owner session token (proves "you are this
// BusinessOwnerAccount" across every business you run) — structurally and
// cryptographically distinct from a tenant JWT, mirrors
// customerAuthMiddleware.verifyGlobalSession exactly.
const verifyOwnerSession = async (req, _res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      const error = new Error("Access denied. Token is required.");
      error.statusCode = 401;
      throw error;
    }

    const decoded = verifyOwnerSessionToken(token);

    if (decoded.type !== "global_owner" || !decoded.ownerAccountId) {
      const error = new Error("Invalid session.");
      error.statusCode = 401;
      throw error;
    }

    // Re-fetch on every request, same revocation posture as verifyToken /
    // verifyGlobalSession.
    const account = await BusinessOwnerAccount.findOne({ _id: decoded.ownerAccountId });

    if (!account) {
      const error = new Error("Access denied. Session is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    req.ownerAccount = { id: decoded.ownerAccountId };

    next();
  } catch (error) {
    error.statusCode = 401;
    next(error);
  }
};

module.exports = { verifyOwnerSession };
