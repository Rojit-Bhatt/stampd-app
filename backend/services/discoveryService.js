const Organization = require("../models/Organization");
const Company = require("../models/Company");
const { resolveProgram } = require("./programService");
const PointsTransaction = require("../models/PointsTransaction");
const { getUpcomingAllOrgs } = require("./eventService");

const TRENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const EVENTS_FEED_LIMIT = 50;

// Returns every active business with enough data for the customer-facing
// /explore directory, plus a real "recentActivityCount" trending signal —
// how many points movements the outlet saw this week. Search, category
// filtering, and nearby/trending sorting all happen client-side over this one
// payload — the in-memory mock DB used in dev/tests has no aggregation or
// $regex support, and at this app's current scale a full scan with a per-org
// count loop (mirroring pointsService.getCustomerDetailRows) is simpler and
// safe.
const getDiscoverBusinesses = async () => {
  const organizations = await Organization.find({ status: "active" });
  const since = new Date(Date.now() - TRENDING_WINDOW_MS);

  const businesses = await Promise.all(
    organizations.map(async (org) => {
      const recentActivityCount = await PointsTransaction.countDocuments({
        organizationId: org._id,
        createdAt: { $gte: since }
      });

      const company = await Company.findOne({ _id: org.companyId });
      // An outlet slug is only unique within its company, so /explore must
      // carry the company slug too — it's a path component the client needs
      // to build /[company]/[outlet], and the only place a slug crosses the
      // API boundary as one.
      if (!company || company.status !== "active") return null;
      const program = resolveProgram(company, org);

      return {
        id: org._id.toString(),
        slug: org.slug,
        companySlug: company.slug,
        companyName: company.name,
        name: org.name,
        category: org.category,
        branding: {
          bannerUrl: org.branding.bannerUrl,
          logoUrl: org.branding.logoUrl,
          bannerImageId: org.branding.bannerImageId || null,
          logoImageId: org.branding.logoImageId || null,
          primaryColor: org.branding.primaryColor
        },
        contact: {
          latitude: org.contact.latitude,
          longitude: org.contact.longitude
        },
        program: {
          earnPercent: program.earnPercent
        },
        createdAt: org.createdAt,
        recentActivityCount
      };
    })
  );

  return { success: true, businesses: businesses.filter(Boolean) };
};

// The events-feed counterpart to getDiscoverBusinesses above: same
// deliberate lack of an organizationId filter, same reason (display-only
// public listing data, not loyalty data), same "loop and join in JS" pattern
// the mock DB's lack of $in/aggregation forces on every cross-tenant read in
// this codebase.
const getUpcomingEventsFeed = async (limit = EVENTS_FEED_LIMIT) => {
  const [events, organizations] = await Promise.all([
    getUpcomingAllOrgs(),
    Organization.find({ status: "active" })
  ]);

  const orgsById = new Map(organizations.map((org) => [org._id.toString(), org]));
  const companyCache = new Map();
  const getCompany = async (companyId) => {
    const key = companyId.toString();
    if (!companyCache.has(key)) {
      companyCache.set(key, await Company.findOne({ _id: companyId }));
    }
    return companyCache.get(key);
  };

  const feed = [];
  for (const event of events) {
    // events is already sorted soonest-first, so the first `limit` survivors
    // of the active-org/active-company filter ARE the soonest `limit` — no
    // need to keep scanning once the cap is hit.
    if (feed.length >= limit) break;

    const org = orgsById.get(event.organizationId.toString());
    if (!org) continue; // suspended or deleted outlet
    const company = await getCompany(org.companyId);
    if (!company || company.status !== "active") continue; // suspended company

    feed.push({
      id: event._id.toString(),
      title: event.title,
      date: event.date,
      time: event.time,
      location: event.location,
      description: event.description,
      imageUrl: event.imageUrl,
      imageId: event.imageId || null,
      rewards: event.rewards || [],
      organizationId: org._id.toString(),
      slug: org.slug,
      companySlug: company.slug,
      businessName: org.name,
      branding: {
        logoUrl: org.branding.logoUrl,
        logoImageId: org.branding.logoImageId || null,
        primaryColor: org.branding.primaryColor
      }
    });
  }

  return { success: true, events: feed };
};

module.exports = { getDiscoverBusinesses, getUpcomingEventsFeed };
