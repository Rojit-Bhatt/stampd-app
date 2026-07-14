const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const DynamicQRToken = require("../models/DynamicQRToken");
const StampCard = require("../models/StampCard");
const Voucher = require("../models/Voucher");
const StampClaimEvent = require("../models/StampClaimEvent");
const Organization = require("../models/Organization");

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

const generateQRToken = async (adminUserId, organizationId) => {
  if (!adminUserId) {
    throw createHttpError("Admin user context is required.", 401);
  }

  if (!organizationId) {
    throw createHttpError("A business context is required.", 400);
  }

  const token = uuidv4();

  await DynamicQRToken.create({
    token,
    generatedBy: adminUserId,
    organizationId
  });

  return {
    success: true,
    data: {
      token,
      expiresInSeconds: TOKEN_TTL_SECONDS
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

  const org = await loadOrganizationOrThrow(organizationId);
  const stampsRequired = org.program.stampsRequired;
  const cooldownHours = org.program.cooldownHours;
  const voucherPrefix = getVoucherPrefix(org);

  const session = await mongoose.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
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
                createdAt: now
              }
            ],
            { session }
          );

          responsePayload = {
            success: true,
            message: "Stamp successfully added to your card.",
            data: {
              stampsEarned: 1,
              rewardTriggered: false
            }
          };
          return;
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

        responsePayload = {
          success: true,
          message: `Milestone reached! You have earned: ${org.program.rewardTitle}.`,
          data: {
            stampsEarned: 0,
            rewardTriggered: true,
            voucherCode,
            rewardTitle: org.program.rewardTitle
          }
        };
        return;
      }

      responsePayload = {
        success: true,
        message: "Stamp successfully added to your card.",
        data: {
          stampsEarned: updatedCard.stampsEarned,
          rewardTriggered: false
        }
      };
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

module.exports = {
  generateQRToken,
  claimStamp,
  getStampBalanceByUserId
};
