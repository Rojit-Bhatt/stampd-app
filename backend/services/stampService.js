const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const DynamicQRToken = require("../models/DynamicQRToken");
const StampCard = require("../models/StampCard");
const Voucher = require("../models/Voucher");
const StampClaimEvent = require("../models/StampClaimEvent");

const TOKEN_TTL_SECONDS = 30;
const STAMP_COOLDOWN_HOURS = 18;

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const generateVoucherCode = async (session) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const randomCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    const voucherCode = `CAFE-${randomCode}`;
    const existingVoucher = await Voucher.findOne({ voucherCode }).session(session);

    if (!existingVoucher) {
      return voucherCode;
    }
  }

  throw createHttpError("Unable to generate a unique voucher code.", 500);
};

const generateQRToken = async (adminUserId) => {
  if (!adminUserId) {
    throw createHttpError("Admin user context is required.", 401);
  }

  const token = uuidv4();

  await DynamicQRToken.create({
    token,
    generatedBy: adminUserId
  });

  return {
    success: true,
    data: {
      token,
      expiresInSeconds: TOKEN_TTL_SECONDS
    }
  };
};

const claimStamp = async ({ token, userId, role }) => {
  if (!token) {
    throw createHttpError("QR token is required.", 400);
  }

  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  if (role !== "customer") {
    throw createHttpError("Only customers can claim stamps.", 403);
  }

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

      // Check if expired
      if (existingToken.createdAt <= tokenExpiryCutoff) {
        throw createHttpError("This QR token has expired.", 400);
      }

      // Atomically mark it as used
      await DynamicQRToken.updateOne({ _id: existingToken._id }, { $set: { isUsed: true } }, { session });

      const cooldownCutoff = new Date(now.getTime() - STAMP_COOLDOWN_HOURS * 60 * 60 * 1000);
      const updatedCard = await StampCard.findOneAndUpdate(
        {
          userId,
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
        const existingCard = await StampCard.findOne({ userId }).session(session);

        if (!existingCard) {
          await StampCard.create(
            [
              {
                userId,
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

        throw createHttpError("You can only claim one stamp every 18 hours.", 400);
      }

      // Log scan event
      await StampClaimEvent.create(
        [
          {
            userId,
            token,
            createdAt: now
          }
        ],
        { session }
      );

      if (updatedCard.stampsEarned >= 5) {
        const voucherCode = await generateVoucherCode(session);

        await Voucher.create(
          [
            {
              userId,
              voucherCode
            }
          ],
          { session }
        );

        await StampCard.findOneAndUpdate(
          { userId },
          { $set: { stampsEarned: 0 } },
          { new: true, session }
        );

        responsePayload = {
          success: true,
          message: "Milestone reached! You have earned a free coffee voucher.",
          data: {
            stampsEarned: 0,
            rewardTriggered: true,
            voucherCode
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

const getStampBalanceByUserId = async (userId) => {
  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  let card = await StampCard.findOne({ userId });

  if (!card) {
    card = await StampCard.create({
      userId,
      stampsEarned: 0,
      lastStampedAt: null
    });
  }

  return {
    success: true,
    data: {
      stampsEarned: card.stampsEarned,
      lastStampedAt: card.lastStampedAt
    }
  };
};

module.exports = {
  generateQRToken,
  claimStamp,
  getStampBalanceByUserId
};
