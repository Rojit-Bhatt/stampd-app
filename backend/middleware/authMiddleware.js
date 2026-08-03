const { verifyAuthToken } = require("../utils/tokenUtils");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Company = require("../models/Company");
const AdminAccount = require("../models/AdminAccount");

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

      if (!organization || organization.status === "suspended" || organization.status === "archived") {
        const error = new Error("This business is suspended.");
        error.statusCode = 401;
        error.code = "TENANT_SUSPENDED";
        throw error;
      }

      // The outlet itself can read "active" while its parent company is
      // suspended — resolveTenant already blocks this on the public side;
      // an already-issued JWT must lose access the same way, not just ride
      // out the rest of JWT_EXPIRES_IN.
      const company = await Company.findOne({ _id: organization.companyId });

      if (!company || company.status === "suspended") {
        const error = new Error("This business is suspended.");
        error.statusCode = 401;
        error.code = "TENANT_SUSPENDED";
        throw error;
      }
    }

    // Only meaningful for role === "business_admin". Read fresh from the DB
    // on every request rather than trusting the JWT — same reasoning as
    // platformRole below: a demotion must take effect immediately, not ride
    // out the rest of JWT_EXPIRES_IN.
    //
    // A business_admin row with no adminAccountId resolves to null, i.e. full
    // access. That is the no-migration promise, not an oversight.
    let staffRole = null;
    if (user.role === "business_admin" && user.adminAccountId) {
      const adminAccount = await AdminAccount.findOne({ _id: user.adminAccountId });
      staffRole = adminAccount ? (adminAccount.staffRole || null) : null;
    }

    req.user = {
      id: decoded.userId,
      role: decoded.role,
      // Tenant the authenticated user belongs to (null for platform admins).
      // Loyalty operations scope to this value, so a user can only ever act
      // within their own tenant regardless of any client-supplied slug.
      organizationId: decoded.organizationId || null,
      // Only meaningful for role === "platform". Read fresh from the DB on
      // every request (the `user` row is already fetched above for the
      // suspended-tenant check) rather than trusting the JWT, so a
      // demotion/promotion takes effect immediately, not just on next login.
      platformRole: user.role === "platform" ? (user.platformRole || "owner") : null,
      // "manager" | "staff" | null. null means the outlet's primary admin
      // (or any account predating this field) — full access.
      staffRole
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
// The platform super-admin (SaaS owner). Either platformRole — owner or
// support — passes this gate; it's the existing baseline for read-only
// platform surfaces.
const isPlatformAdmin = requireRole("platform", "Platform admin");

// The stricter platform gate: only platformRole "owner" passes. Used for
// onboarding/editing/suspending a business, platform contact settings, and
// managing the platform team itself — "support" is read-only everywhere
// this guard is used.
const isPlatformOwner = (req, res, next) => {
  if (!req.user || req.user.role !== "platform" || req.user.platformRole !== "owner") {
    return res.status(403).json({
      success: false,
      message: "Forbidden: platform owner access required."
    });
  }
  next();
};

// The outlet-console counterpart to isPlatformOwner: a second, ADDITIONAL
// gate mounted after isBusinessAdmin, never instead of it. isBusinessAdmin
// still decides whether you are this outlet's staff at all; this decides
// which parts of the console that entitles you to.
//
// Actions are coarse on purpose — one per console AREA, not per route — so
// a new route in an existing area cannot land ungated behind a
// plausible-looking new action name.
const STAFF_ACTIONS = [
  "manage_settings",   // PATCH /settings: branding, contact, points program, tiers
  "manage_catalog",    // menu + rewards + images
  "manage_marketing",  // campaigns + events + broadcasts
  "view_reports",      // dashboard, reports, downloads, ledger, customer roster
  "manage_staff"       // the sub-admin surface itself
];

const staffRoleAllows = (staffRole, action) => {
  if (!staffRole) return true;                    // primary admin / pre-roles
  if (staffRole === "manager") return action !== "manage_staff";
  return false;                                   // "staff": the counter only
};

const requireStaffPermission = (action) => {
  if (!STAFF_ACTIONS.includes(action)) {
    throw new Error(`Unknown staff permission action: ${action}`);
  }
  return (req, res, next) => {
    if (!req.user || !staffRoleAllows(req.user.staffRole, action)) {
      // One message for all five actions. Naming the action back would tell a
      // restricted account the shape of the model it's being kept out of, and
      // buys a legitimate user nothing they can act on.
      return res.status(403).json({
        success: false,
        message: "Forbidden: this action isn't available for your role.",
        code: "STAFF_ROLE_FORBIDDEN"
      });
    }
    next();
  };
};

module.exports = {
  verifyToken,
  isBusinessAdmin,
  isPlatformAdmin,
  isPlatformOwner,
  requireStaffPermission,
  staffRoleAllows
};
