const crypto = require("crypto");
const mongoose = require("mongoose");
const PendingClaim = require("../models/PendingClaim");
const CustomerAccount = require("../models/CustomerAccount");
const {
  consumeDynamicQrToken,
  awardPointsInTransaction,
  loadOrganizationOrThrow
} = require("./pointsService");
const { ensureMembership } = require("./customerAccountService");

const PENDING_CLAIM_TTL_MS = 15 * 60 * 1000;

const createHttpError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

// A PendingClaim's _id addresses the row; this secret authorizes acting on
// it. They must stay separate: the id is an ObjectId, whose per-process
// counter increments predictably on real MongoDB, so it is guessable by
// anyone who has started a single claim of their own.
const newClaimSecret = () => crypto.randomBytes(32).toString("hex");

// Constant-time compare, so a wrong secret can't be narrowed byte-by-byte
// from response timing.
const secretMatches = (provided, stored) => {
  if (typeof provided !== "string" || typeof stored !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

// The one gate for "is this caller the person who scanned the QR?".
// Deliberately returns the same 404 as a missing claim: a wrong secret must
// not confirm that the id exists.
const assertClaimSecret = (claim, claimSecret) => {
  if (!secretMatches(claimSecret, claim.claimSecret)) {
    throw createHttpError("Claim not found.", 404);
  }
};

// Converts a still-fresh (<=30s) DynamicQRToken into a longer-lived
// PendingClaim the instant /:slug/claim loads — from then on the flow is
// keyed by this record, immune to the original QR's short fuse. Idempotent:
// a page refresh / StrictMode double-invoke re-resolves the same claim.
const convertTokenToPendingClaim = async ({ token, organizationId }) => {
  const existing = await PendingClaim.findOne({ sourceToken: token, organizationId });
  if (existing) {
    // Safe to hand the secret back: presenting the sourceToken already
    // proves this caller scanned the QR, which is the same thing the secret
    // attests. This is the page-refresh / StrictMode path.
    return {
      success: true,
      data: {
        pendingClaimId: existing._id.toString(),
        claimSecret: existing.claimSecret,
        expiresAt: existing.expiresAt
      }
    };
  }

  const claimSecret = newClaimSecret();
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => {
      const consumedToken = await consumeDynamicQrToken({ token, organizationId, session, purpose: "earn" });
      const [created] = await PendingClaim.create(
        [
          {
            organizationId,
            billAmount: consumedToken.billAmount,
            generatedBy: consumedToken.generatedBy,
            sourceToken: token,
            claimSecret,
            customerAccountId: null,
            fulfilled: false,
            expiresAt: new Date(Date.now() + PENDING_CLAIM_TTL_MS)
          }
        ],
        { session }
      );
      // The ONLY time the secret leaves the server: to whoever just burned
      // the 30s QR token, i.e. the person standing at the counter.
      out = {
        success: true,
        data: {
          pendingClaimId: created._id.toString(),
          claimSecret,
          expiresAt: created.expiresAt
        }
      };
    });
    return out;
  } finally {
    session.endSession();
  }
};

// Public polling read — lets a tab with no tenant session (the "verify on a
// different tab/device" case) find out whether its claim has been fulfilled.
const getClaimStatus = async ({ pendingClaimId, organizationId, claimSecret }) => {
  // Scope the query rather than checking the tenant afterward — the same
  // pattern every other service uses. It fails closed; a forgotten JS check
  // fails open, which is exactly how linkPendingClaimToAccount went wrong.
  const claim = await PendingClaim.findOne({ _id: pendingClaimId, organizationId });
  if (!claim) {
    // Never leak cross-tenant existence.
    throw createHttpError("Claim not found.", 404);
  }
  // This read returns what the customer earned (points, bill, balance), so
  // it needs the same proof-of-scan as binding does.
  assertClaimSecret(claim, claimSecret);

  const expired = !claim.fulfilled && claim.expiresAt.getTime() <= Date.now();
  return { success: true, data: { fulfilled: claim.fulfilled, expired, ...(claim.result || {}) } };
};

// Called right after a brand-new signup (before verification) so the claim
// is remembered against that account and can be auto-fulfilled once verified.
//
// SECURITY: this runs from an UNAUTHENTICATED register request, so the
// claimSecret is the only thing standing between a stranger and someone
// else's pending earn. Without it, guessing a PendingClaim id was enough to
// bind another customer's points — and their membership — to your own
// account, while they got "already used" and a zero balance.
const linkPendingClaimToAccount = async ({ pendingClaimId, claimSecret, customerAccountId }) => {
  const claim = await PendingClaim.findOne({ _id: pendingClaimId });
  if (!claim) throw createHttpError("Claim not found.", 404);
  assertClaimSecret(claim, claimSecret);
  if (claim.fulfilled) throw createHttpError("This claim has already been used.", 400, "CLAIM_ALREADY_FULFILLED");
  if (claim.expiresAt.getTime() <= Date.now()) throw createHttpError("This claim has expired.", 400);
  if (claim.customerAccountId && claim.customerAccountId.toString() !== customerAccountId) {
    throw createHttpError("This claim is already linked to a different account.", 409);
  }

  if (!claim.customerAccountId) {
    claim.customerAccountId = customerAccountId;
    await claim.save();
  }

  return { success: true };
};

// The real stamp-award for a PendingClaim — same transaction shape as
// claimStamp, keyed by the claim's membership user instead of req.user
// directly (the caller resolves organizationId from the tenant JWT).
const fulfillPendingClaim = async ({ pendingClaimId, organizationId, customerAccountId, claimSecret }) => {
  const claim = await PendingClaim.findOne({ _id: pendingClaimId, organizationId });
  if (!claim) {
    throw createHttpError("Claim not found.", 404);
  }
  // Reachable by a benign race, not just a stale/replayed request: the
  // claim tab can be backgrounded (e.g. to open the emailed verify link),
  // the server-side autoFulfillForAccount can fulfill it the moment
  // verification lands, and the tab can then resume/reload and try to
  // fulfill the very claim it's already been granted. The code lets the
  // client tell "genuinely already used" apart from "already used BY ME,
  // successfully" and show success instead of an error for the latter.
  if (claim.fulfilled) throw createHttpError("This claim has already been used.", 400, "CLAIM_ALREADY_FULFILLED");
  if (claim.expiresAt.getTime() <= Date.now()) throw createHttpError("This claim has expired.", 400);

  if (claim.customerAccountId && claim.customerAccountId.toString() !== customerAccountId) {
    throw createHttpError("This claim belongs to a different account.", 403);
  }
  if (!claim.customerAccountId) {
    // BINDING an unclaimed row — the same act linkPendingClaimToAccount
    // performs, so it needs the same proof. Being *any* signed-in customer
    // at this outlet is not proof: anyone can enter-tenant. Only the person
    // who burned the QR token has the secret.
    //
    // Already-bound claims skip this: the account match above is stronger,
    // and autoFulfillForAccount (post-verification, possibly another device)
    // has no secret to offer.
    assertClaimSecret(claim, claimSecret);
    claim.customerAccountId = customerAccountId;
    await claim.save();
  }

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  // No emailVerified gate here, matching claimPoints: a signup that happened
  // BECAUSE someone scanned a QR at the counter must land its first earn
  // immediately, not hours later when they get round to their inbox.
  // autoFulfillForAccount still runs on verification and is now simply a
  // no-op for these — it only ever picks up claims still unfulfilled.
  const membershipUser = await ensureMembership({ customerAccountId, organizationId, account });

  const org = await loadOrganizationOrThrow(organizationId);
  const session = await mongoose.startSession();
  try {
    let responsePayload;
    await session.withTransaction(async () => {
      responsePayload = await awardPointsInTransaction({
        session,
        userId: membershipUser._id.toString(),
        organizationId,
        billAmount: claim.billAmount,
        org,
        now: new Date(),
        token: claim.sourceToken
      });

      // Same atomic single-use guard pattern as DynamicQRToken.isUsed.
      const consumed = await PendingClaim.updateOne(
        { _id: claim._id, fulfilled: false },
        { $set: { fulfilled: true, fulfilledAt: new Date(), result: responsePayload.data } },
        { session }
      );
      if (!consumed || consumed.modifiedCount === 0) {
        throw createHttpError("This claim has already been used.", 400);
      }
    });
    return responsePayload;
  } finally {
    session.endSession();
  }
};

// Called right after email verification — fulfills every unfulfilled,
// unexpired PendingClaim linked to this account, across every tenant.
// Skips failures per-claim so one tenant's edge case (e.g. cooldown) doesn't
// block another.
// Needs no claimSecret, and that's correct by construction: it only ever
// loads claims ALREADY bound to this account, so fulfillPendingClaim's
// binding branch (the one that demands the secret) never fires. The binding
// already happened, gated, at register/fulfill time.
const autoFulfillForAccount = async (customerAccountId) => {
  const claims = await PendingClaim.find({ customerAccountId, fulfilled: false });
  const now = Date.now();
  const out = [];

  for (const claim of claims) {
    if (claim.expiresAt.getTime() <= now) continue;
    try {
      const result = await fulfillPendingClaim({
        pendingClaimId: claim._id.toString(),
        organizationId: claim.organizationId.toString(),
        customerAccountId: customerAccountId.toString()
      });
      const org = await loadOrganizationOrThrow(claim.organizationId.toString());
      out.push({ organizationId: claim.organizationId.toString(), organizationName: org.name, ...result.data });
    } catch (_err) {
      // One tenant's edge case shouldn't block others.
    }
  }

  return out;
};

module.exports = {
  convertTokenToPendingClaim,
  getClaimStatus,
  linkPendingClaimToAccount,
  fulfillPendingClaim,
  autoFulfillForAccount
};
