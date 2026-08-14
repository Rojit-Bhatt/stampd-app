// Shared Zod schemas for request-body validation. Imported by the mutating
// controllers (points earn/redeem QR generation, claim fulfill, subscription
// key issuance, tenant settings) and mounted via validateBody in
// middleware/validateBody.js.
//
// Zod strips unknown keys on parse, so after validation req.body contains
// ONLY fields these schemas declare — no accidental write of an extra field
// the handler "happens to forward". Keep every schema minimal: validate only
// what the endpoint mutates.
const { z } = require("zod");

const objectIdString = () => z.string().min(1).max(48);

// POST /api/admin/generate-qr — the bill the customer actually paid, in
// rupees. Mirrors parseBillAmountOrThrow (pointsService): must be a finite
// positive number.
const generateQrSchema = z.object({
  billAmount: z.union([z.number(), z.string()]).refine(
    (v) => Number.isFinite(Number(v)) && Number(v) > 0,
    "Enter the bill amount first — points are earned on what was paid."
  ),
  // Optional staff PIN attribution — the same shape pointsService's
  // resolvePinAttribution expects; everything else is stripped.
  pin: z.string().optional()
});

// POST /api/admin/generate-redeem-qr — nothing to enter but the PIN when
// the outlet runs one (pinLimiter + the skip rule decide whether pin is
// even looked at).
const generateRedeemQrSchema = z.object({
  pin: z.string().optional()
});

// POST /api/points/claim — the customer-side claim of their own scan.
const claimPointsSchema = z.object({
  token: z.string().min(1).max(512)
});

// POST /api/points/redeem — the reward picked after scanning a redeem QR.
const redeemPointsSchema = z.object({
  token: z.string().min(1).max(512),
  itemId: objectIdString(),
  // kind must be exactly "menu" or "reward" — resolveRedeemable in
  // pointsService treats anything else as menu, so an unvalidated kind
  // could silently change which collection is queried.
  kind: z.enum(["menu", "reward"])
});

// POST /api/claim/:pendingClaimId/fulfill — the claim page's final step.
// claimSecret is the proof that this caller burned the QR token; without
// it an unclaimed row must never bind (see pendingClaimService). NOTE:
// claimSecret is OPTIONAL at the schema because the service distinguishes
// "no secret supplied" from "wrong secret" by returning 404 for BOTH (see
// claim-hijack suite) — validating presence here would turn the first case
// into a 400 and change the response the tests (and the indistinguishable
// error contract) assert. When present, it is still type-checked and
// length-capped; the service's secret check is the real authorization.
const fulfillClaimSchema = z.object({
  claimSecret: z.string().min(1).max(256).optional()
});

// POST /api/platform/subscription-keys — platform admin issues an
// activation key for a known plan slug. note is free text, capped so one
// row can't balloon.
const generateKeySchema = z.object({
  planSlug: z.string().min(1).max(64),
  note: z.string().max(500).optional()
});

// PATCH /api/admin/settings — tenant-owned business config. Each block is
// validated only if present; deeper structure (branding images, program
// fields, tier thresholds) is checked by the service's own guards where
// shape matters more than type, so the schemas stay shallow on purpose:
// they stop clearly-wrong payloads at the door without duplicating every
// business rule.
const BUSINESS_CATEGORIES = ["cafe", "restaurant", "bakery", "salon", "gym", "retail", "other"];
const updateMySettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(BUSINESS_CATEGORIES).optional(),
  menuEnabled: z.boolean().optional(),
  branding: z.record(z.string(), z.any()).optional(),
  contact: z.record(z.string(), z.any()).optional(),
  program: z.record(z.string(), z.any()).optional(),
  // null is a documented no-op sentinel for clearing tier thresholds in
  // tests (tier-system "null is a no-op, not a 500") — pass it through, the
  // service treats it as unchanged anyway.
  tierThresholds: z.union([z.record(z.string(), z.any()), z.null()]).optional(),
  messagingTriggers: z.record(z.string(), z.any()).optional(),
  customerInfo: z.record(z.string(), z.any()).optional()
});

module.exports = {
  generateQrSchema,
  generateRedeemQrSchema,
  claimPointsSchema,
  redeemPointsSchema,
  fulfillClaimSchema,
  generateKeySchema,
  updateMySettingsSchema
};
