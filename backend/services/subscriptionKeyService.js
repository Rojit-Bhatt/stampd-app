const crypto = require("crypto");
const SubscriptionKey = require("../models/SubscriptionKey");
const Organization = require("../models/Organization");
const { getPlanBySlug } = require("./subscriptionPlanService");
const { assertPlanChangeAllowed, applyPurchase } = require("./subscriptionService");

const createHttpError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

// Same shape/style as stampService's voucher codes — 4 random bytes, hex,
// uppercased. Collision probability is negligible at this app's scale; a
// findOne uniqueness check backstops it anyway (mock DB doesn't enforce
// `unique`, same caveat as every other global-uniqueness field here).
const generateCode = () => `KEY-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const formatKey = (key) => ({
  id: key._id.toString(),
  code: key.code,
  planSlug: key.planSlug,
  status: key.status,
  note: key.note || "",
  assignedToOwnerAccountId: key.assignedToOwnerAccountId ? key.assignedToOwnerAccountId.toString() : null,
  createdAt: key.createdAt,
  redeemedAt: key.redeemedAt
});

// Platform owner generates a key scoped to a plan. No amount/payment is
// recorded here — confirming payment happens entirely out-of-band (phone/
// email), and `note` is just the platform admin's own free-text reminder of
// why/for-whom this key was cut.
const generateKey = async ({ planSlug, note, actorId }) => {
  if (!planSlug) throw createHttpError("planSlug is required.", 400);

  const plan = await getPlanBySlug(planSlug);

  let code;
  let collision = true;
  while (collision) {
    code = generateCode();
    collision = Boolean(await SubscriptionKey.findOne({ code }));
  }

  const key = await SubscriptionKey.create({
    code,
    planId: plan._id,
    planSlug: plan.slug,
    status: "unused",
    generatedByActorId: actorId,
    note: (note || "").trim()
  });

  return { success: true, key: formatKey(key) };
};

const listKeys = async () => {
  const keys = await SubscriptionKey.find({});
  const sorted = [...keys].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { success: true, keys: sorted.map(formatKey) };
};

const revokeKey = async (code) => {
  const key = await SubscriptionKey.findOne({ code: String(code || "").trim().toUpperCase() });
  if (!key) throw createHttpError("Key not found.", 404);
  if (key.status !== "unused") {
    throw createHttpError("Only an unused key can be revoked.", 400);
  }

  const updated = await SubscriptionKey.findOneAndUpdate(
    { _id: key._id },
    { $set: { status: "revoked" } },
    { new: true }
  );

  return { success: true, key: formatKey(updated) };
};

// The core redemption: validates the key, runs the same downgrade-over-limit
// check a real checkout would, then applies the plan to the owner's
// subscription (subscriptionService.applyPurchase — same extend-from-
// current-period-end-if-still-active logic whether the activation came from
// a gateway or, as here, a manually-issued key).
const redeemKey = async ({ code, ownerAccountId }) => {
  if (!code) throw createHttpError("A key is required.", 400);

  const normalizedCode = String(code).trim().toUpperCase();
  const key = await SubscriptionKey.findOne({ code: normalizedCode });

  if (!key) throw createHttpError("That key wasn't recognized.", 404);
  if (key.status !== "unused") {
    throw createHttpError("That key has already been used or revoked.", 400);
  }

  const plan = await getPlanBySlug(key.planSlug);
  await assertPlanChangeAllowed(ownerAccountId, plan);

  const subscription = await applyPurchase({ ownerAccountId, plan });

  await SubscriptionKey.findOneAndUpdate(
    { _id: key._id },
    { $set: { status: "redeemed", assignedToOwnerAccountId: ownerAccountId, redeemedAt: new Date() } }
  );

  return { success: true, subscription };
};

// Resolves a tenant-scoped organizationId to the owner account that should
// see/manage its subscription — used by the /:slug/admin console's
// Subscription page, which authenticates via the normal tenant JWT (no
// separate owner login needed to view/redeem for the business you already
// operate).
const resolveOwnerAccountForOrganization = async (organizationId) => {
  const organization = await Organization.findOne({ _id: organizationId });
  if (!organization || !organization.ownerAccountId) {
    throw createHttpError("This business has no owner account attached.", 404);
  }
  return organization.ownerAccountId;
};

module.exports = {
  createHttpError,
  generateKey,
  listKeys,
  revokeKey,
  redeemKey,
  resolveOwnerAccountForOrganization
};
