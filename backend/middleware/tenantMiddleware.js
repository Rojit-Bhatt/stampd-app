const Company = require("../models/Company");
const Organization = require("../models/Organization");

// Hosts that are never treated as a company subdomain.
const RESERVED_SUBDOMAINS = new Set(["www", "api", "app", "localhost"]);

// Resolve the active company+outlet pair from the request. An outlet's slug
// is unique only WITHIN its company, so a single slug can never identify a
// tenant — both segments are always required. Checks, in order:
//   1. X-Company-Slug + X-Outlet-Slug headers (sent by the frontend based on
//      the /[company]/[outlet] URL) — the primary path-based mechanism.
//   2. :companySlug / :outletSlug route params.
//   3. The Host subdomain for the company (the future custom-domain path),
//      with the outlet still coming from the route param.
const extractTenantRef = (req) => {
  const headerCompany = req.headers["x-company-slug"];
  const headerOutlet = req.headers["x-outlet-slug"];
  if (typeof headerCompany === "string" && typeof headerOutlet === "string") {
    return {
      companySlug: headerCompany.trim().toLowerCase(),
      outletSlug: headerOutlet.trim().toLowerCase()
    };
  }

  const paramCompany = req.params && req.params.companySlug;
  const paramOutlet = req.params && req.params.outletSlug;
  if (paramCompany && paramOutlet) {
    return {
      companySlug: String(paramCompany).trim().toLowerCase(),
      outletSlug: String(paramOutlet).trim().toLowerCase()
    };
  }

  const host = (req.headers.host || "").split(":")[0];
  const labels = host.split(".");
  if (labels.length > 2) {
    const candidate = labels[0].toLowerCase();
    if (!RESERVED_SUBDOMAINS.has(candidate) && paramOutlet) {
      return {
        companySlug: candidate,
        outletSlug: String(paramOutlet).trim().toLowerCase()
      };
    }
  }

  return null;
};

// Loads the company + outlet onto req.company / req.organization /
// req.organizationId, or 404s. req.organizationId stays exactly what it has
// always been — one outlet's id — so every downstream tenant-scoped query
// and the whole isolation invariant are unchanged by the company layer.
const resolveTenant = async (req, _res, next) => {
  try {
    const ref = extractTenantRef(req);

    if (!ref || !ref.companySlug || !ref.outletSlug) {
      const error = new Error("No outlet specified. A company and outlet are required.");
      error.statusCode = 400;
      throw error;
    }

    const company = await Company.findOne({ slug: ref.companySlug });

    if (!company) {
      const error = new Error(`Company '${ref.companySlug}' was not found.`);
      error.statusCode = 404;
      throw error;
    }

    // A suspended company takes all of its outlets down with it.
    if (company.status === "suspended") {
      const error = new Error("This business is currently unavailable.");
      error.statusCode = 403;
      error.code = "TENANT_SUSPENDED";
      throw error;
    }

    const organization = await Organization.findOne({ companyId: company._id, slug: ref.outletSlug });

    if (!organization) {
      const error = new Error(`Outlet '${ref.outletSlug}' was not found.`);
      error.statusCode = 404;
      throw error;
    }

    if (organization.status === "suspended" || organization.status === "archived") {
      const error = new Error("This business is currently unavailable.");
      error.statusCode = 403;
      error.code = "TENANT_SUSPENDED";
      throw error;
    }

    req.company = company;
    req.companyId = company._id.toString();
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
  extractTenantRef
};
