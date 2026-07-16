const { verifyAuthToken } = require("../utils/tokenUtils");
const User = require("../models/User");
const Organization = require("../models/Organization");

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

const verifyToken = async (req, _res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      const error = new Error("Access denied. Token is required.");
      error.statusCode = 401;
      throw error;
    }

    const decoded = verifyAuthToken(token);

    if (!decoded.userId || !decoded.role) {
      const error = new Error("Invalid token payload.");
      error.statusCode = 401;
      throw error;
    }

    // Re-verify against the DB on every request, so a demoted/deleted user or
    // a suspended tenant's already-issued token stops working immediately
    // instead of staying valid for the rest of its lifetime (JWT_EXPIRES_IN).
    const user = await User.findOne({ _id: decoded.userId });

    if (!user || user.role !== decoded.role) {
      const error = new Error("Access denied. Token is no longer valid.");
      error.statusCode = 401;
      throw error;
    }

    if (decoded.organizationId) {
      const organization = await Organization.findOne({ _id: decoded.organizationId });

      if (!organization || organization.status === "suspended") {
        const error = new Error("This business is suspended.");
        error.statusCode = 401;
        error.code = "TENANT_SUSPENDED";
        throw error;
      }
    }

    req.user = {
      id: decoded.userId,
      role: decoded.role,
      // Tenant the authenticated user belongs to (null for platform admins).
      // Loyalty operations scope to this value, so a user can only ever act
      // within their own tenant regardless of any client-supplied slug.
      organizationId: decoded.organizationId || null
    };

    next();
  } catch (error) {
    error.statusCode = 401;
    next(error);
  }
};

const requireRole = (role, label) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: ${label} access required.`
    });
  }
  next();
};

// A tenant's admin (barista/owner console).
const isBusinessAdmin = requireRole("business_admin", "Business admin");
// The platform super-admin (SaaS owner).
const isPlatformAdmin = requireRole("platform", "Platform admin");

module.exports = {
  verifyToken,
  isBusinessAdmin,
  isPlatformAdmin
};
