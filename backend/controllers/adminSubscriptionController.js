const { resolveOwnerAccountForOrganization, redeemKey } = require("../services/subscriptionKeyService");
const { getSubscriptionSummary } = require("../services/subscriptionService");

// Tenant-scoped Subscription page (inside the existing /:slug/admin
// console) — resolves the authenticated business_admin's organization to
// its owner account under the hood, so whoever operates this business day-
// to-day can see/manage its subscription without a separate owner login.
const getMySubscription = async (req, res, next) => {
  try {
    const ownerAccountId = await resolveOwnerAccountForOrganization(req.user.organizationId);
    const result = await getSubscriptionSummary(ownerAccountId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const redeemMyKey = async (req, res, next) => {
  try {
    const { code } = req.body;
    const ownerAccountId = await resolveOwnerAccountForOrganization(req.user.organizationId);
    const result = await redeemKey({ code, ownerAccountId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { getMySubscription, redeemMyKey };
