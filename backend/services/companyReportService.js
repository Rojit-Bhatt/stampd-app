const Organization = require("../models/Organization");
const User = require("../models/User");
const StampClaimEvent = require("../models/StampClaimEvent");
const Voucher = require("../models/Voucher");

const DAY_MS = 24 * 60 * 60 * 1000;

// Cross-outlet rollup for the company console. Deliberately company-private:
// this is only ever reachable through /api/company (verifyCompanySession),
// never through /api/admin — an outlet's own console must never be able to
// see its siblings' numbers. Same reasoning as the per-tenant reporting
// isolation the customer identity already preserves.
//
// Summed in JS per outlet rather than aggregated, because the mock DB has no
// aggregation pipeline — the same approach reportService.getDashboardStats
// already takes.
const getCompanyRollup = async (companyId) => {
  const outlets = await Organization.find({ companyId });
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY_MS);

  const perOutlet = await Promise.all(
    outlets.map(async (outlet) => {
      const customers = await User.find({ organizationId: outlet._id, role: "customer" });
      const events = await StampClaimEvent.find({ organizationId: outlet._id });
      const vouchers = await Voucher.find({ organizationId: outlet._id });

      const recentEvents = events.filter((e) => new Date(e.createdAt) >= weekAgo);
      const revenue = events.reduce((sum, e) => sum + (e.billAmount || 0), 0);

      return {
        outletId: outlet._id.toString(),
        slug: outlet.slug,
        name: outlet.name,
        status: outlet.status,
        customersCount: customers.length,
        stampsIssued: events.length,
        stampsIssuedThisWeek: recentEvents.length,
        vouchersEarned: vouchers.length,
        vouchersRedeemed: vouchers.filter((v) => v.isValid === false).length,
        revenue
      };
    })
  );

  const totals = perOutlet.reduce(
    (acc, o) => ({
      customersCount: acc.customersCount + o.customersCount,
      stampsIssued: acc.stampsIssued + o.stampsIssued,
      stampsIssuedThisWeek: acc.stampsIssuedThisWeek + o.stampsIssuedThisWeek,
      vouchersEarned: acc.vouchersEarned + o.vouchersEarned,
      vouchersRedeemed: acc.vouchersRedeemed + o.vouchersRedeemed,
      revenue: acc.revenue + o.revenue
    }),
    { customersCount: 0, stampsIssued: 0, stampsIssuedThisWeek: 0, vouchersEarned: 0, vouchersRedeemed: 0, revenue: 0 }
  );

  return {
    success: true,
    totals: { ...totals, outletCount: perOutlet.filter((o) => o.status !== "archived").length },
    outlets: perOutlet.sort((a, b) => b.revenue - a.revenue)
  };
};

module.exports = { getCompanyRollup };
