const SubscriptionPlan = require("../models/SubscriptionPlan");
const { DEFAULT_PLANS } = require("../config/subscription");
const { logAction } = require("./platformAuditService");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeSlug = (slug) =>
  String(slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

const formatPlan = (plan) => ({
  id: plan._id.toString(),
  slug: plan.slug,
  name: plan.name,
  priceNpr: plan.priceNpr,
  businessLimit: plan.businessLimit,
  features: plan.features || [],
  isMostPopular: plan.isMostPopular,
  billingIntervalDays: plan.billingIntervalDays,
  isActive: plan.isActive,
  sortOrder: plan.sortOrder
});

// Called once at boot (see server.js seedDemoData) — idempotent, only
// creates plans that don't already exist by slug.
const ensureDefaultPlansSeeded = async () => {
  for (const def of DEFAULT_PLANS) {
    const existing = await SubscriptionPlan.findOne({ slug: def.slug });
    if (!existing) {
      await SubscriptionPlan.create(def);
    }
  }
};

// Platform admin/owner view — every plan, active or archived, sorted for the
// management table. Sorted in plain JS (mock DB's .sort() has no secondary
// tiebreaker), same pattern as platformAuditService.listRecent.
const listAllPlans = async () => {
  const plans = await SubscriptionPlan.find({});
  const sorted = [...plans].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return { success: true, plans: sorted.map(formatPlan) };
};

// Public pricing-page view — active plans only.
const listActivePlans = async () => {
  const plans = await SubscriptionPlan.find({ isActive: true });
  const sorted = [...plans].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return { success: true, plans: sorted.map(formatPlan) };
};

const getPlanBySlug = async (slug) => {
  const plan = await SubscriptionPlan.findOne({ slug: normalizeSlug(slug) });
  if (!plan) throw createHttpError("Plan not found.", 404);
  return plan;
};

const createPlan = async ({ name, slug, priceNpr, businessLimit, features, isMostPopular, sortOrder, actorId, actorName }) => {
  if (!name || !slug || priceNpr === undefined || businessLimit === undefined) {
    throw createHttpError("name, slug, priceNpr, and businessLimit are required.", 400);
  }
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) throw createHttpError("A valid slug is required.", 400);
  if (Number(priceNpr) < 0) throw createHttpError("priceNpr must be >= 0.", 400);
  if (Number(businessLimit) < 1) throw createHttpError("businessLimit must be >= 1.", 400);

  const existing = await SubscriptionPlan.findOne({ slug: normalizedSlug });
  if (existing) throw createHttpError("A plan with this slug already exists.", 409);

  const plan = await SubscriptionPlan.create({
    name: name.trim(),
    slug: normalizedSlug,
    priceNpr: Number(priceNpr),
    businessLimit: Number(businessLimit),
    features: Array.isArray(features) ? features : [],
    isMostPopular: Boolean(isMostPopular),
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0
  });

  await logAction({
    actorId, actorName, action: "plan_create", organizationId: null,
    targetName: plan.name, details: `Rs ${plan.priceNpr}/yr, ${plan.businessLimit} business limit`
  });

  return { success: true, plan: formatPlan(plan) };
};

const updatePlan = async (slug, { name, priceNpr, businessLimit, features, isMostPopular, isActive, sortOrder, actorId, actorName }) => {
  const plan = await getPlanBySlug(slug);

  if (priceNpr !== undefined && Number(priceNpr) < 0) throw createHttpError("priceNpr must be >= 0.", 400);
  if (businessLimit !== undefined && Number(businessLimit) < 1) throw createHttpError("businessLimit must be >= 1.", 400);

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (priceNpr !== undefined) updates.priceNpr = Number(priceNpr);
  if (businessLimit !== undefined) updates.businessLimit = Number(businessLimit);
  if (features !== undefined) updates.features = Array.isArray(features) ? features : [];
  if (isMostPopular !== undefined) updates.isMostPopular = Boolean(isMostPopular);
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);

  const updated = await SubscriptionPlan.findOneAndUpdate(
    { _id: plan._id },
    { $set: updates },
    { new: true }
  );

  // NOTE: existing Subscriptions snapshot businessLimitAtPurchase at
  // purchase/renewal time (Phase 3) — this edit intentionally does not
  // retroactively change any already-purchased subscription's limit.
  await logAction({
    actorId, actorName, action: "plan_edit", organizationId: null,
    targetName: updated.name, details: `Updated: ${Object.keys(updates).join(", ") || "no changes"}`
  });

  return { success: true, plan: formatPlan(updated) };
};

// Soft-archive only — see the model's isActive comment. Plans are never hard
// deleted since a Subscription may still reference one by id/slug.
const archivePlan = async (slug, { actorId, actorName }) => {
  const plan = await getPlanBySlug(slug);
  const updated = await SubscriptionPlan.findOneAndUpdate(
    { _id: plan._id },
    { $set: { isActive: false } },
    { new: true }
  );

  await logAction({
    actorId, actorName, action: "plan_delete", organizationId: null,
    targetName: updated.name, details: "Archived (soft-deleted)"
  });

  return { success: true, plan: formatPlan(updated) };
};

module.exports = {
  createHttpError,
  formatPlan,
  ensureDefaultPlansSeeded,
  listAllPlans,
  listActivePlans,
  getPlanBySlug,
  createPlan,
  updatePlan,
  archivePlan
};
