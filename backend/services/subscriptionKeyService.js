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

// 8 random bytes (64 bits): a redeemed key grants a real paid plan to
// whoever presents it first (it isn't bound to a company at generation
// time), so the space needs a wider margin than a single-outlet voucher
// code. A findOne check backstops collisions — the mock DB doesn't enforce
// `unique`, same caveat as every other global-uniqueness field here.
const generateCode = () => `KEY-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

const formatKey = (key) => ({
  id: key._id.toString(),
  code: key.code,
  planSlug: key.planSlug,
  status: key.status,
  note: key.note || "",
  assignedToCompanyId: key.assignedToCompanyId ? key.assignedToCompanyId.toString() : null,
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

// The core redemption: validates the key, runs the downgrade-over-limit
// check, then applies the plan to the company's subscription
// (subscriptionService.applyPurchase — extends from the current period end
// when still active, so redeeming early never loses paid days).
const redeemKey = async ({ code, companyId }) => {
  if (!code) throw createHttpError("A key is required.", 400);

  const normalizedCode = String(code).trim().toUpperCase();
  const key = await SubscriptionKey.findOne({ code: normalizedCode });

  if (!key) throw createHttpError("That key wasn't recognized.", 404);

  // Atomically flip unused -> redeemed FIRST, gated on the query itself
  // still matching status:"unused" — this is the actual claim. Two
  // concurrent redemptions of the same code (a double-click, or two tabs)
  // can both pass the plain findOne above, but only one findOneAndUpdate
  // with this predicate can ever return a document, so only one proceeds to
  // applyPurchase. Without it, both would stack an activation period from a
  // single key.
  const claimed = await SubscriptionKey.findOneAndUpdate(
    { _id: key._id, status: "unused" },
    { $set: { status: "redeemed", assignedToCompanyId: companyId, redeemedAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    throw createHttpError("That key has already been used or revoked.", 400);
  }

  try {
    const plan = await getPlanBySlug(key.planSlug);
    await assertPlanChangeAllowed(companyId, plan);
    const subscription = await applyPurchase({ companyId, plan });
    return { success: true, subscription };
  } catch (error) {
    // The claim succeeded but activation failed (e.g. downgrade-over-limit)
    // — release the key back to unused rather than burning it on a
    // rejected redemption.
    await SubscriptionKey.findOneAndUpdate(
      { _id: key._id },
      { $set: { status: "unused", assignedToCompanyId: null, redeemedAt: null } }
    );
    throw error;
  }
};

// Resolves an outlet to the company whose subscription covers it.
const resolveCompanyForOrganization = async (organizationId) => {
  const organization = await Organization.findOne({ _id: organizationId });
  if (!organization || !organization.companyId) {
    throw createHttpError("This outlet has no company attached.", 404);
  }
  return organization.companyId;
};

module.exports = {
  createHttpError,
  generateKey,
  listKeys,
  revokeKey,
  redeemKey,
  resolveCompanyForOrganization
};
