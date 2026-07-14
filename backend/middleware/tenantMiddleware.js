const Organization = require("../models/Organization");

// Hosts that are never treated as a tenant subdomain.
const RESERVED_SUBDOMAINS = new Set(["www", "api", "app", "localhost"]);

// Resolve the active tenant slug from the request. Checks, in order:
//   1. X-Tenant-Slug header (sent by the frontend based on the URL path) — the
//      primary mechanism for today's path-based tenancy.
//   2. A :slug route param.
//   3. The subdomain of the Host header — the future custom-domain path.
// Switching fully to subdomains later needs no code change here.
const extractTenantSlug = (req) => {
  const headerSlug = req.headers["x-tenant-slug"];
  if (headerSlug && typeof headerSlug === "string") {
    return headerSlug.trim().toLowerCase();
  }

  if (req.params && req.params.slug) {
    return String(req.params.slug).trim().toLowerCase();
  }

  const host = (req.headers.host || "").split(":")[0];
  const labels = host.split(".");
  if (labels.length > 2) {
    const candidate = labels[0].toLowerCase();
    if (!RESERVED_SUBDOMAINS.has(candidate)) {
      return candidate;
    }
  }

  return null;
};

// Loads the tenant onto req.organization / req.organizationId, or 404s.
const resolveTenant = async (req, _res, next) => {
  try {
    const slug = extractTenantSlug(req);

    if (!slug) {
      const error = new Error("No business specified. A tenant slug is required.");
      error.statusCode = 400;
      throw error;
    }

    const organization = await Organization.findOne({ slug });

    if (!organization) {
      const error = new Error(`Business '${slug}' was not found.`);
      error.statusCode = 404;
      throw error;
    }

    if (organization.status === "suspended") {
      const error = new Error("This business is currently unavailable.");
      error.statusCode = 403;
      throw error;
    }

    req.organization = organization;
    req.organizationId = organization._id.toString();
    next();
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 400;
    }
    next(error);
  }
};

module.exports = {
  resolveTenant,
  extractTenantSlug
};
