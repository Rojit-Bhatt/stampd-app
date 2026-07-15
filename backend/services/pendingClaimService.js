const mongoose = require("mongoose");
const PendingClaim = require("../models/PendingClaim");
const CustomerAccount = require("../models/CustomerAccount");
const {
  consumeDynamicQrToken,
  awardStampInTransaction,
  loadOrganizationOrThrow
} = require("./stampService");
const { ensureMembership } = require("./customerAccountService");

const PENDING_CLAIM_TTL_MS = 15 * 60 * 1000;

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Converts a still-fresh (<=30s) DynamicQRToken into a longer-lived
// PendingClaim the instant /:slug/claim loads — from then on the flow is
// keyed by this record, immune to the original QR's short fuse. Idempotent:
// a page refresh / StrictMode double-invoke re-resolves the same claim.
const convertTokenToPendingClaim = async ({ token, organizationId }) => {
  const existing = await PendingClaim.findOne({ sourceToken: token, organizationId });
  if (existing) {
    return { success: true, data: { pendingClaimId: existing._id.toString(), expiresAt: existing.expiresAt } };
  }

  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => {
      const consumedToken = await consumeDynamicQrToken({ token, organizationId, session });
      const [created] = await PendingClaim.create(
        [
          {
            organizationId,
            billAmount: consumedToken.billAmount,
            generatedBy: consumedToken.generatedBy,
            sourceToken: token,
            customerAccountId: null,
            fulfilled: false,
            expiresAt: new Date(Date.now() + PENDING_CLAIM_TTL_MS)
          }
        ],
        { session }
      );
      out = { success: true, data: { pendingClaimId: created._id.toString(), expiresAt: created.expiresAt } };
    });
    return out;
  } finally {
    session.endSession();
  }
};

// Public polling read — lets a tab with no tenant session (the "verify on a
// different tab/device" case) find out whether its claim has been fulfilled.
const getClaimStatus = async ({ pendingClaimId, organizationId }) => {
  const claim = await PendingClaim.findOne({ _id: pendingClaimId });
  if (!claim || claim.organizationId.toString() !== organizationId) {
    // Never leak cross-tenant existence.
    throw createHttpError("Claim not found.", 404);
  }

  const expired = !claim.fulfilled && claim.expiresAt.getTime() <= Date.now();
  return { success: true, data: { fulfilled: claim.fulfilled, expired, ...(claim.result || {}) } };
};

// Called right after a brand-new signup (before verification) so the claim
// is remembered against that account and can be auto-fulfilled once verified.
const linkPendingClaimToAccount = async ({ pendingClaimId, customerAccountId }) => {
  const claim = await PendingClaim.findOne({ _id: pendingClaimId });
  if (!claim) throw createHttpError("Claim not found.", 404);
  if (claim.fulfilled) throw createHttpError("This claim has already been used.", 400);
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
const fulfillPendingClaim = async ({ pendingClaimId, organizationId, customerAccountId }) => {
  const claim = await PendingClaim.findOne({ _id: pendingClaimId });
  if (!claim || claim.organizationId.toString() !== organizationId) {
    throw createHttpError("Claim not found.", 404);
  }
  if (claim.fulfilled) throw createHttpError("This claim has already been used.", 400);
  if (claim.expiresAt.getTime() <= Date.now()) throw createHttpError("This claim has expired.", 400);

  if (claim.customerAccountId && claim.customerAccountId.toString() !== customerAccountId) {
    throw createHttpError("This claim belongs to a different account.", 403);
  }
  if (!claim.customerAccountId) {
    claim.customerAccountId = customerAccountId;
    await claim.save();
  }

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  const membershipUser = await ensureMembership({ customerAccountId, organizationId, account });
  if (!membershipUser.emailVerified) {
    // Do NOT mark fulfilled — leave pending so the verify-email hook can
    // complete it later. Same message claimStamp already uses for this case.
    throw createHttpError("Please verify your email before collecting stamps.", 403);
  }

  const org = await loadOrganizationOrThrow(organizationId);
  const session = await mongoose.startSession();
  try {
    let responsePayload;
    await session.withTransaction(async () => {
      responsePayload = await awardStampInTransaction({
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
