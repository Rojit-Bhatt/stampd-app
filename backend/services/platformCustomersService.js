const CustomerAccount = require("../models/CustomerAccount");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Company = require("../models/Company");
const PointsBalance = require("../models/PointsBalance");
const PointsTransaction = require("../models/PointsTransaction");
const { toPoints } = require("../utils/pointsMath");
const { resolveTier } = require("./tierService");

// Platform-console view of every registered customer. Identity, contact,
// membership location, points state and verification — the platform's
// "who is on our platform" list, verified and unverified alike (see the
// Analytics tile this service feeds).
//
// Membership loyalty state is per-outlet (User + PointsBalance +
// PointsTransaction, same derivation as the outlet console's customers
// list). A customer signed up at several outlets appears once, summarised
// by their FIRST membership (the one that brought them on); those with no
// membership still appear because they registered.
const MAX_ROWS = 1000;

async function loadOrgsById(ids) {
  const map = new Map();
  if (ids.length === 0) return map;
  const dedup = [...new Set(ids.map((i) => i.toString()))];
  const orgs = await Organization.find({ _id: { $in: dedup } });
  for (const o of orgs) map.set(o._id.toString(), o);
  return map;
}
async function loadCompaniesById(ids) {
  const map = new Map();
  if (ids.length === 0) return map;
  const dedup = [...new Set(ids.map((i) => i.toString()))];
  const companies = await Company.find({ _id: { $in: dedup } });
  for (const c of companies) map.set(c._id.toString(), c);
  return map;
}

const getPlatformCustomers = async ({ search } = {}) => {
  const accounts = await CustomerAccount.find({}).sort({ createdAt: -1 });
  const truncated = accounts.length > MAX_ROWS;
  const slice = accounts.slice(0, MAX_ROWS);

  // One batched read per collection instead of N+1 inside the loop — the
  // same discipline getCustomerDetailRows applies to the outlet console.
  const memberships =
    slice.length > 0
      ? await User.find({ role: "customer", customerAccountId: { $in: slice.map((a) => a._id) } })
      : [];
  const firstMembershipByAccount = new Map();
  for (const m of memberships) {
    const key = m.customerAccountId ? m.customerAccountId.toString() : null;
    if (key && !firstMembershipByAccount.has(key)) firstMembershipByAccount.set(key, m);
  }

  const orgIds = [...new Set(memberships.map((m) => m.organizationId.toString()))];
  const orgs = await loadOrgsById(orgIds);
  const companyIds = [...new Set([...orgs.values()].map((o) => o.companyId.toString()))];
  const companies = await loadCompaniesById(companyIds);

  const memberIds = memberships.map((m) => m._id);
  const balancesByUser = new Map(
    memberIds.length > 0
      ? (await PointsBalance.find({ userId: { $in: memberIds } }))
          .map((b) => [b.userId.toString(), b])
      : []
  );
  const redeemsByUser = new Map(
    memberIds.length > 0
      ? (await PointsTransaction.find({ userId: { $in: memberIds }, type: "redeem" }))
          .reduce((byUser, t) => {
            const key = t.userId.toString();
            byUser.set(key, (byUser.get(key) || 0) + 1);
            return byUser;
          }, new Map())
      : []
  );
  const earnsByUser = new Map(
    memberIds.length > 0
      ? (await PointsTransaction.find({ userId: { $in: memberIds }, type: "earn" }))
          .reduce((byUser, t) => {
            const key = t.userId.toString();
            const list = byUser.get(key) || [];
            list.push(t);
            byUser.set(key, list);
            return byUser;
          }, new Map())
      : []
  );

  const rows = await Promise.all(
    slice.map(async (account) => {
      const idKey = account._id.toString();
      const membership = firstMembershipByAccount.get(idKey) || null;
      let companyName = "";
      let companySlug = "";
      let outletName = "";
      let outletSlug = "";
      let points = 0;
      let tier = null;
      let redemptionCount = 0;
      let lastActivityAt = null;
      if (membership) {
        const org = orgs.get(membership.organizationId.toString());
        if (org) {
          outletName = org.name;
          outletSlug = org.slug;
          const company = companies.get(org.companyId.toString());
          if (company) {
            companyName = company.name;
            companySlug = company.slug;
          }
        }
        const balance = balancesByUser.get(membership._id.toString()) || null;
        points = toPoints(balance ? balance.balanceCenti : 0);
        redemptionCount = redeemsByUser.get(membership._id.toString()) || 0;
        lastActivityAt = balance ? balance.lastActivityAt : null;
        // Same tier derivation as the outlet console: thresholds resolved
        // against the membership's own earn transactions.
        const earns = earnsByUser.get(membership._id.toString()) || [];
        tier = await resolveTier(
          membership.organizationId,
          membership._id,
          { org: orgs.get(membership.organizationId.toString()), earns }
        );
      }

      return {
        id: idKey,
        name: account.name,
        email: account.email,
        phone: account.phone || "",
        emailVerified: Boolean(account.emailVerified),
        companyName,
        companySlug,
        outletName,
        outletSlug,
        points,
        tier,
        redemptionCount,
        joinedAt: account.createdAt,
        lastActivityAt
      };
    })
  );

  // Server-side search keeps the table and the export on the same truth at
  // demo scale; the frontend applies the identical filter over the payload.
  const q = (search || "").trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.name, r.email, r.phone, r.companyName, r.outletName].some((v) =>
          v.toLowerCase().includes(q)
        )
      )
    : rows;

  return { rows: filtered, total: accounts.length, truncated };
};

module.exports = { getPlatformCustomers, MAX_ROWS };
