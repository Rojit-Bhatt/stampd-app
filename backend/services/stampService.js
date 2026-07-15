const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const DynamicQRToken = require("../models/DynamicQRToken");
const StampCard = require("../models/StampCard");
const Voucher = require("../models/Voucher");
const StampClaimEvent = require("../models/StampClaimEvent");
const Organization = require("../models/Organization");
const User = require("../models/User");

const TOKEN_TTL_SECONDS = 30;

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getVoucherPrefix = (org) => {
  const derived = (org && org.slug ? org.slug : "").replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  return derived || "RWD";
};

const loadOrganizationOrThrow = async (organizationId) => {
  if (!organizationId) {
    throw createHttpError("A business context is required.", 400);
  }

  const org = await Organization.findOne({ _id: organizationId });

  if (!org) {
    throw createHttpError("Business not found.", 404);
  }

  return org;
};

const generateVoucherCode = async (session, prefix) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const randomCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    const voucherCode = `${prefix}-${randomCode}`;
    const existingVoucher = await Voucher.findOne({ voucherCode }).session(session);

    if (!existingVoucher) {
      return voucherCode;
    }
  }

  throw createHttpError("Unable to generate a unique voucher code.", 500);
};

const generateQRToken = async (adminUserId, organizationId, billAmount) => {
  if (!adminUserId) {
    throw createHttpError("Admin user context is required.", 401);
  }

  const org = await loadOrganizationOrThrow(organizationId);
  const minBillAmount = org.program.minBillAmount || 0;

  if (minBillAmount > 0) {
    const amount = Number(billAmount);
    if (billAmount === undefined || billAmount === null || billAmount === "" || Number.isNaN(amount) || amount < 0) {
      throw createHttpError("Bill amount is required to generate a code.", 400);
    }
    if (amount < minBillAmount) {
      throw createHttpError(`Bill amount must be at least ${minBillAmount}.`, 400);
    }
  }

  const token = uuidv4();
  const storedBillAmount =
    billAmount !== undefined && billAmount !== null && billAmount !== "" && !Number.isNaN(Number(billAmount))
      ? Number(billAmount)
      : null;

  await DynamicQRToken.create({
    token,
    generatedBy: adminUserId,
    organizationId,
    billAmount: storedBillAmount
  });

  return {
    success: true,
    data: {
      token,
      expiresInSeconds: TOKEN_TTL_SECONDS
    }
  };
};

// Validates + atomically single-use-consumes a DynamicQRToken. Extracted out
// of claimStamp so pendingClaimService can reuse the exact same logic when
// converting a scanned QR into a PendingClaim. Requires an open session
// (caller manages the transaction). Same checks, same error messages, same
// order as claimStamp always ran them.
const consumeDynamicQrToken = async ({ token, organizationId, session }) => {
  const now = new Date();
  const tokenExpiryCutoff = new Date(now.getTime() - TOKEN_TTL_SECONDS * 1000);

  // Check if already used first (absolute first check)
  const usedToken = await DynamicQRToken.findOne({ token, isUsed: true }).session(session);
  if (usedToken) {
    throw createHttpError("QR Code has already been used.", 400);
  }

  // Check if exists
  const existingToken = await DynamicQRToken.findOne({ token }).session(session);
  if (!existingToken) {
    throw createHttpError("Invalid QR token.", 400);
  }

  // Check it belongs to this tenant
  if (existingToken.organizationId.toString() !== organizationId) {
    throw createHttpError("Invalid QR token.", 400);
  }

  // Check if expired
  if (existingToken.createdAt <= tokenExpiryCutoff) {
    throw createHttpError("This QR token has expired.", 400);
  }

  // Atomically consume the token: only the first claimer flips
  // isUsed false -> true. The earlier findOne read is racy on its own —
  // two customers scanning the same 30s token could both pass it — so the
  // conditional update is the authoritative single-use guard.
  const consumed = await DynamicQRToken.updateOne(
    { _id: existingToken._id, isUsed: false },
    { $set: { isUsed: true } },
    { session }
  );
  if (!consumed || consumed.modifiedCount === 0) {
    throw createHttpError("QR Code has already been used.", 400);
  }

  return existingToken;
};

// The cooldown/increment/voucher-threshold/event-logging core of a stamp
// claim, keyed by whatever token string the caller wants recorded on the
// StampClaimEvent audit row (claimStamp passes the raw DynamicQRToken uuid;
// pendingClaimService passes the PendingClaim's stored sourceToken).
// Extracted out of claimStamp so pendingClaimService.fulfillPendingClaim can
// reuse the exact same stamp-award logic without duplicating it. Requires an
// open session (caller manages the transaction).
const awardStampInTransaction = async ({ session, userId, organizationId, billAmount, org, now, token }) => {
  const stampsRequired = org.program.stampsRequired;
  const cooldownHours = org.program.cooldownHours;
  const voucherPrefix = getVoucherPrefix(org);
  const claimedBillAmount = billAmount ?? null;

  const cooldownCutoff = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000);
  const updatedCard = await StampCard.findOneAndUpdate(
    {
      userId,
      organizationId,
      $or: [{ lastStampedAt: null }, { lastStampedAt: { $lte: cooldownCutoff } }]
    },
    {
      $inc: { stampsEarned: 1 },
      $set: { lastStampedAt: now }
    },
    {
      new: true,
      session
    }
  );

  if (!updatedCard) {
    const existingCard = await StampCard.findOne({ userId, organizationId }).session(session);

    if (!existingCard) {
      await StampCard.create(
        [
          {
            userId,
            organizationId,
            stampsEarned: 1,
            lastStampedAt: now
          }
        ],
        { session }
      );

      await StampClaimEvent.create(
        [
          {
            userId,
            organizationId,
            token,
            billAmount: claimedBillAmount,
            createdAt: now
          }
        ],
        { session }
      );

      return {
        success: true,
        message: "Stamp successfully added to your card.",
        data: {
          stampsEarned: 1,
          rewardTriggered: false
        }
      };
    }

    throw createHttpError(`You can only claim one stamp every ${cooldownHours} hours.`, 400);
  }

  // Log scan event
  await StampClaimEvent.create(
    [
      {
        userId,
        organizationId,
        token,
        billAmount: claimedBillAmount,
        createdAt: now
      }
    ],
    { session }
  );

  if (updatedCard.stampsEarned >= stampsRequired) {
    const voucherCode = await generateVoucherCode(session, voucherPrefix);

    await Voucher.create(
      [
        {
          userId,
          organizationId,
          voucherCode
        }
      ],
      { session }
    );

    await StampCard.findOneAndUpdate(
      { userId, organizationId },
      { $set: { stampsEarned: 0 } },
      { new: true, session }
    );

    return {
      success: true,
      message: `Milestone reached! You have earned: ${org.program.rewardTitle}.`,
      data: {
        stampsEarned: 0,
        rewardTriggered: true,
        voucherCode,
        rewardTitle: org.program.rewardTitle
      }
    };
  }

  return {
    success: true,
    message: "Stamp successfully added to your card.",
    data: {
      stampsEarned: updatedCard.stampsEarned,
      rewardTriggered: false
    }
  };
};

const claimStamp = async ({ token, userId, role, organizationId }) => {
  if (!token) {
    throw createHttpError("QR token is required.", 400);
  }

  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  if (role !== "customer") {
    throw createHttpError("Only customers can claim stamps.", 403);
  }

  const claimer = await User.findOne({ _id: userId, organizationId });
  if (!claimer) {
    throw createHttpError("Account not found.", 404);
  }
  if (claimer.emailVerified === false) {
    throw createHttpError("Please verify your email before collecting stamps.", 403);
  }

  const org = await loadOrganizationOrThrow(organizationId);

  const session = await mongoose.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const now = new Date();
      const existingToken = await consumeDynamicQrToken({ token, organizationId, session });
      responsePayload = await awardStampInTransaction({
        session, userId, organizationId, billAmount: existingToken.billAmount, org, now, token
      });
    });

    return responsePayload;
  } finally {
    session.endSession();
  }
};

const getStampBalanceByUserId = async (userId, organizationId) => {
  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  const org = await loadOrganizationOrThrow(organizationId);

  let card = await StampCard.findOne({ userId, organizationId });

  if (!card) {
    card = await StampCard.create({
      userId,
      organizationId,
      stampsEarned: 0,
      lastStampedAt: null
    });
  }

  return {
    success: true,
    data: {
      stampsEarned: card.stampsEarned,
      lastStampedAt: card.lastStampedAt,
      stampsRequired: org.program.stampsRequired,
      rewardTitle: org.program.rewardTitle,
      rewardDescription: org.program.rewardDescription
    }
  };
};

const getCustomerDetailRows = async (organizationId) => {
  const customers = await User.find({ role: "customer", organizationId }).sort({ name: 1 });

  const rows = await Promise.all(
    customers.map(async (customer) => {
      const stampCard = await StampCard.findOne({ userId: customer._id, organizationId });
      const stampsEarned = stampCard ? stampCard.stampsEarned : 0;
      const lastStampedAt = stampCard ? stampCard.lastStampedAt : null;

      const validVoucherCount = (
        await Voucher.find({
          userId: customer._id,
          organizationId,
          isValid: true,
        })
      ).length;

      const lifetimeVoucherCount = await Voucher.countDocuments({
        userId: customer._id,
        organizationId,
      });

      const allEvents = await StampClaimEvent.find({ userId: customer._id, organizationId })
        .sort({ createdAt: -1 });

      const scanHistory = allEvents.slice(0, 10).map((event) => ({
        id: event._id.toString(),
        timestamp: event.createdAt,
      }));

      const totalSpent = allEvents.reduce((sum, event) => sum + (event.billAmount || 0), 0);

      const idStr = customer._id.toString();
      const suffix = idStr.substring(Math.max(0, idStr.length - 5)).toUpperCase();
      const formattedId = `NO. ${suffix.padStart(5, '0')}`;

      return {
        id: idStr,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        address: customer.address || "",
        customerNo: formattedId,
        stampsEarned,
        lastStampedAt,
        validVoucherCount,
        lifetimeVoucherCount,
        totalSpent,
        scanHistory,
      };
    })
  );

  return rows;
};

module.exports = {
  generateQRToken,
  claimStamp,
  getStampBalanceByUserId,
  getCustomerDetailRows,
  // Reused by pendingClaimService — same logic, no behavior change here.
  consumeDynamicQrToken,
  awardStampInTransaction,
  loadOrganizationOrThrow
};
