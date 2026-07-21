const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const DynamicQRToken = require("../models/DynamicQRToken");
const PointsBalance = require("../models/PointsBalance");
const PointsTransaction = require("../models/PointsTransaction");
const MenuItem = require("../models/MenuItem");
const RewardItem = require("../models/RewardItem");
const Organization = require("../models/Organization");
const Company = require("../models/Company");
const User = require("../models/User");
const CustomerAccount = require("../models/CustomerAccount");
const { resolveProgram } = require("./programService");
const { resolveActiveMultiplier } = require("./campaignService");
const { earnCenti, toPoints } = require("../utils/pointsMath");
const { resolveDateRange } = require("../utils/dateRange");

// An EARN token only has to survive being scanned: the instant it is, it
// converts into a PendingClaim that lives 15 minutes, which is what actually
// gives the customer time to sign in. 30 seconds is plenty, and short is the
// point — it's what stops a screenshotted code being re-scanned later.
//
// A REDEEM token has no such conversion. It is consumed at the moment the
// customer confirms a reward, so the same 30 seconds has to cover scanning,
// reading the catalog, choosing, and confirming — on a phone, at a counter.
// That is not enough time, and the window expiring mid-choice spends nothing
// but makes the customer start over. The token stays single-use and
// staff-initiated either way, so the longer life costs nothing.
const TOKEN_TTL_SECONDS = 30;
const REDEEM_TOKEN_TTL_SECONDS = 180;
const ttlForPurpose = (purpose) =>
  purpose === "redeem" ? REDEEM_TOKEN_TTL_SECONDS : TOKEN_TTL_SECONDS;

const DAY_MS = 24 * 60 * 60 * 1000;

const createHttpError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
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

// An outlet's own program fields are null unless it explicitly overrides
// them, so they must never be read straight off the document — resolve
// against the owning company's defaults first.
const loadProgram = async (org) => {
  const company = org.companyId ? await Company.findOne({ _id: org.companyId }) : null;
  return resolveProgram(company, org);
};

// A bill is required for every earn: the award is a function of it, so
// without one there is nothing to award. Shared by token generation and the
// award itself — staff is stopped at the QR, and the award re-checks rather
// than trusting that it was.
const parseBillAmountOrThrow = (billAmount) => {
  if (billAmount === undefined || billAmount === null || billAmount === "") {
    throw createHttpError("Enter the bill amount first — points are earned on what was paid.", 400);
  }

  const amount = Number(billAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError("That bill amount doesn't look right — enter what the customer paid.", 400);
  }

  // Money is two decimal places. Round once, here, so the figure stored on
  // the token is the same one every downstream receipt and revenue report
  // reads back.
  return Math.round(amount * 100) / 100;
};

// --- expiry -----------------------------------------------------------
//
// Expiry is ROLLING INACTIVITY: a balance dies N days after the customer's
// last earn or redeem, so any activity keeps the whole balance alive.
//
// The deadline is SNAPSHOTTED onto the row at every write (see expiryAtFrom)
// and read back from there — never re-derived from the live program. That
// distinction is the whole design:
//
//   derived  — an admin lowering pointsExpiryDays instantly vaporizes every
//              idle balance with no ledger row and no notice, and raising it
//              resurrects points customers were already told were gone, fully
//              spendable. "Expired" would never be final.
//   snapshot — the window in force at the customer's last visit governs. A
//              policy change applies to future visits only.
//
// Still no cron: the deadline is a stored date, compared at read time, and
// written down (zeroed + logged) on the next write.

// The deadline a write should stamp on the row, from the program in force
// right now. Null = this program never expires points.
const expiryAtFrom = (program, now) => {
  const days = program.pointsExpiryDays;
  if (!days || days <= 0) return null;
  return new Date(now.getTime() + days * DAY_MS);
};

const isExpiredNow = (balance, now = new Date()) => {
  if (!balance) return false;
  if (balance.balanceCenti <= 0) return false;   // nothing to lose
  if (!balance.expiresAt) return false;          // no deadline = never expires

  return now.getTime() > new Date(balance.expiresAt).getTime();
};

// The balance a customer actually has right now, without writing anything.
const effectiveBalanceCenti = (balance, now = new Date()) => {
  if (!balance) return 0;
  return isExpiredNow(balance, now) ? 0 : balance.balanceCenti;
};

// When the balance dies if the customer does nothing. Null = never.
const expiresAtFor = (balance) => {
  if (!balance || balance.balanceCenti <= 0) return null;
  return balance.expiresAt || null;
};

// Writes down an expiry that has already happened: zeroes the row and logs
// the loss to the ledger. Called before any balance mutation so that an earn
// lands on a correctly-zeroed balance rather than topping up dead points.
//
// The balanceCenti equality guard makes this safe to race: if another writer
// moved the balance between our read and this update, we lose the guard and
// leave their state alone rather than clobbering it.
const settleExpiryInTransaction = async ({ session, organizationId, userId, now }) => {
  const balance = await PointsBalance.findOne({ organizationId, userId }).session(session);
  if (!isExpiredNow(balance, now)) return balance;

  const lostCenti = balance.balanceCenti;
  // The instant the points actually died, which may be long before we noticed.
  const diedAt = new Date(balance.expiresAt);

  const settled = await PointsBalance.findOneAndUpdate(
    { _id: balance._id, balanceCenti: lostCenti },
    // Clear the deadline too: an empty balance has nothing left to expire, and
    // leaving a stale date would make the row look perpetually expiring.
    { $set: { balanceCenti: 0, expiresAt: null, expiredAt: now } },
    { new: true, session }
  );

  if (!settled) {
    return PointsBalance.findOne({ organizationId, userId }).session(session);
  }

  await PointsTransaction.create(
    [
      {
        organizationId,
        userId,
        type: "expire",
        pointsCenti: -lostCenti,
        balanceAfterCenti: 0,
        // Dated when the points EXPIRED, not when this write happened to
        // notice. Two reasons: it's the truth, and it's what lets a report
        // count each expiry exactly once — in the period it actually fell in,
        // whether or not it has been materialized yet.
        createdAt: diedAt
      }
    ],
    { session }
  );

  return settled;
};

// --- token generation -------------------------------------------------

const generateQRToken = async (adminUserId, organizationId, billAmount) => {
  if (!adminUserId) {
    throw createHttpError("Admin user context is required.", 401);
  }

  const org = await loadOrganizationOrThrow(organizationId);
  const storedBillAmount = parseBillAmountOrThrow(billAmount);

  const token = uuidv4();
  await DynamicQRToken.create({
    token,
    generatedBy: adminUserId,
    organizationId,
    purpose: "earn",
    billAmount: storedBillAmount
  });

  // A preview only. The authoritative number is computed again at claim time
  // (a campaign can start, or the 30s token can be scanned after it ends), so
  // this must never be stored — it's here to put the real figure in front of
  // staff before the customer scans.
  const program = await loadProgram(org);
  const { multiplier, campaign } = await resolveActiveMultiplier(organizationId, new Date());

  return {
    success: true,
    data: {
      token,
      purpose: "earn",
      billAmount: storedBillAmount,
      expiresInSeconds: TOKEN_TTL_SECONDS,
      previewPoints: toPoints(earnCenti(storedBillAmount, program.earnPercent, multiplier)),
      multiplier,
      campaignName: campaign ? campaign.name : null
    }
  };
};

// The redeem side of the counter. Staff-initiated for the same reason earn
// is: a customer must never be able to move their own balance. Carries no
// bill and no item — the customer picks the reward after scanning.
const generateRedeemToken = async (adminUserId, organizationId) => {
  if (!adminUserId) {
    throw createHttpError("Admin user context is required.", 401);
  }

  await loadOrganizationOrThrow(organizationId);

  const token = uuidv4();
  await DynamicQRToken.create({
    token,
    generatedBy: adminUserId,
    organizationId,
    purpose: "redeem",
    billAmount: null
  });

  return {
    success: true,
    data: { token, purpose: "redeem", expiresInSeconds: REDEEM_TOKEN_TTL_SECONDS }
  };
};

// Validates + atomically single-use-consumes a DynamicQRToken. Shared by the
// earn claim, the redeem flow, and pendingClaimService. Requires an open
// session (caller manages the transaction).
const consumeDynamicQrToken = async ({ token, organizationId, session, purpose = "earn" }) => {
  const now = new Date();
  // Keyed off the purpose the caller is consuming AS, which is the same
  // purpose the token was minted with — a mismatch is rejected below before
  // expiry is ever judged, so a redeem token can't borrow the earn window.
  const tokenExpiryCutoff = new Date(now.getTime() - ttlForPurpose(purpose) * 1000);

  const usedToken = await DynamicQRToken.findOne({ token, isUsed: true }).session(session);
  if (usedToken) {
    throw createHttpError("QR Code has already been used.", 400);
  }

  const existingToken = await DynamicQRToken.findOne({ token }).session(session);
  if (!existingToken) {
    throw createHttpError("Invalid QR token.", 400);
  }

  if (existingToken.organizationId.toString() !== organizationId) {
    throw createHttpError("Invalid QR token.", 400);
  }

  // An earn token must never be spendable as a redeem token, or vice versa —
  // otherwise scanning the counter's earn QR on the redeem page would move a
  // balance the wrong way.
  if (existingToken.purpose !== purpose) {
    throw createHttpError("Invalid QR token.", 400);
  }

  if (existingToken.createdAt <= tokenExpiryCutoff) {
    throw createHttpError("This QR token has expired.", 400);
  }

  // Atomically consume: only the first claimer flips isUsed false -> true.
  // The findOne above is racy on its own — two customers scanning the same
  // 30s token could both pass it — so this conditional update is the
  // authoritative single-use guard. It is also what serializes concurrent
  // earns, which is why removing the old cooldown left no gap.
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

// --- earn -------------------------------------------------------------

// The award core, keyed by whatever token string the caller wants recorded
// on the ledger row (claimPoints passes the raw DynamicQRToken uuid;
// pendingClaimService passes the PendingClaim's stored sourceToken).
// Requires an open session (caller manages the transaction).
//
// There is no cooldown: every bill earns. The token's single-use guard
// already stops the same scan being replayed, and two genuine bills in one
// hour are two genuine earns.
const awardPointsInTransaction = async ({ session, userId, organizationId, billAmount, org, now, token }) => {
  const program = await loadProgram(org);
  const amount = parseBillAmountOrThrow(billAmount);

  // Resolved at the moment of the earn, not when the QR was generated: a
  // campaign that starts between the two should apply, and the customer is
  // told what they actually got either way.
  const { multiplier, campaign } = await resolveActiveMultiplier(organizationId, now);
  const earnedCenti = earnCenti(amount, program.earnPercent, multiplier);

  await settleExpiryInTransaction({ session, organizationId, userId, now });

  const updated = await PointsBalance.findOneAndUpdate(
    { userId, organizationId },
    {
      $inc: { balanceCenti: earnedCenti },
      // Both stamped together: activity restarts the clock, and the deadline
      // it restarts to is the one this outlet's program promises TODAY.
      $set: { lastActivityAt: now, expiresAt: expiryAtFrom(program, now) }
    },
    { new: true, upsert: true, session }
  );

  await PointsTransaction.create(
    [
      {
        organizationId,
        userId,
        type: "earn",
        pointsCenti: earnedCenti,
        balanceAfterCenti: updated.balanceCenti,
        billAmount: amount,
        earnPercent: program.earnPercent,
        // Both snapshotted: the ledger has to keep saying why this row is
        // worth what it is, even after the campaign ends or is deleted.
        multiplier,
        campaignId: campaign ? campaign._id : null,
        campaignName: campaign ? campaign.name : "",
        token,
        createdAt: now
      }
    ],
    { session }
  );

  return {
    success: true,
    message: `You earned ${toPoints(earnedCenti)} points.`,
    data: {
      pointsEarned: toPoints(earnedCenti),
      billAmount: amount,
      balance: toPoints(updated.balanceCenti),
      earnPercent: program.earnPercent,
      // Null unless a campaign actually applied, so the celebration can call
      // it out without the caller re-deriving anything.
      multiplier,
      campaignName: campaign ? campaign.name : null
    }
  };
};

const claimPoints = async ({ token, userId, role, organizationId }) => {
  if (!token) {
    throw createHttpError("QR token is required.", 400);
  }

  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  if (role !== "customer") {
    throw createHttpError("Only customers can earn points.", 403);
  }

  const claimer = await User.findOne({ _id: userId, organizationId });
  if (!claimer) {
    throw createHttpError("Account not found.", 404);
  }
  // Deliberately NOT gated on emailVerified. Earning is the moment the
  // customer is standing at the counter with a 30-second QR on screen —
  // bouncing them to their inbox there loses the earn for a bill that was
  // genuinely paid. Verification is enforced at REDEEM instead
  // (see redeemPoints), which is the only side that can cost the outlet
  // anything, and which the customer can complete on their own time.

  const org = await loadOrganizationOrThrow(organizationId);

  const session = await mongoose.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const now = new Date();
      const existingToken = await consumeDynamicQrToken({ token, organizationId, session, purpose: "earn" });
      responsePayload = await awardPointsInTransaction({
        session, userId, organizationId, billAmount: existingToken.billAmount, org, now, token
      });
    });

    return responsePayload;
  } finally {
    session.endSession();
  }
};

// --- redeem -----------------------------------------------------------

// What this outlet will accept points for: menu items that have been given a
// points price, plus standalone rewards that only exist for points. Merged
// here so nothing downstream has to know there are two collections.
const getRedeemCatalog = async (organizationId) => {
  const [menuItems, rewardItems] = await Promise.all([
    MenuItem.find({ organizationId, isAvailable: true }).sort({ sortOrder: 1 }),
    RewardItem.find({ organizationId, isActive: true }).sort({ sortOrder: 1 })
  ]);

  const fromMenu = menuItems
    // A null price means menu-only: adding points to an outlet must never put
    // its whole menu up for redemption.
    .filter((item) => item.pointsPriceCenti !== null && item.pointsPriceCenti !== undefined)
    .map((item) => ({
      id: item._id.toString(),
      kind: "menu",
      name: item.name,
      description: item.description || "",
      category: item.category,
      imageUrl: "",
      pointsPrice: toPoints(item.pointsPriceCenti)
    }));

  const fromRewards = rewardItems.map((item) => ({
    id: item._id.toString(),
    kind: "reward",
    name: item.name,
    description: item.description || "",
    category: "Rewards",
    imageUrl: item.imageUrl || "",
    pointsPrice: toPoints(item.pointsPriceCenti)
  }));

  return [...fromMenu, ...fromRewards].sort((a, b) => a.pointsPrice - b.pointsPrice);
};

// Resolve a catalog id to something redeemable, scoped to this outlet so an
// id lifted from another outlet's catalog simply doesn't exist here.
//
// `kind` is optional: ObjectIds are unique across collections, so falling
// back to searching both is safe, and it keeps an older client that doesn't
// send a kind working.
const resolveRedeemable = async (organizationId, itemId, kind) => {
  if (kind !== "reward") {
    const item = await MenuItem.findOne({ _id: itemId, organizationId });
    if (item && item.pointsPriceCenti !== null && item.pointsPriceCenti !== undefined) {
      return {
        kind: "menu",
        doc: item,
        name: item.name,
        priceCenti: item.pointsPriceCenti,
        available: item.isAvailable
      };
    }
    if (kind === "menu") return null;
  }

  const reward = await RewardItem.findOne({ _id: itemId, organizationId });
  if (reward) {
    return {
      kind: "reward",
      doc: reward,
      name: reward.name,
      priceCenti: reward.pointsPriceCenti,
      available: reward.isActive
    };
  }

  return null;
};

const redeemPoints = async ({ token, itemId, kind, userId, role, organizationId }) => {
  if (!token) throw createHttpError("QR token is required.", 400);
  if (!itemId) throw createHttpError("Pick something to redeem first.", 400);
  if (!userId) throw createHttpError("Authenticated user context is required.", 401);
  if (role !== "customer") throw createHttpError("Only customers can redeem points.", 403);

  // The one place email verification is enforced. Earning is open (a paid
  // bill should never be lost to an unread inbox); spending is not, because
  // this is the side that hands over something real and the side an
  // unreachable account could be used to walk off with.
  const redeemer = await User.findOne({ _id: userId, organizationId });
  if (!redeemer) throw createHttpError("Account not found.", 404);
  if (redeemer.emailVerified === false) {
    throw createHttpError(
      "Verify your email before redeeming — your points are safe in the meantime.",
      403,
      "EMAIL_NOT_VERIFIED"
    );
  }

  const org = await loadOrganizationOrThrow(organizationId);
  const program = await loadProgram(org);

  const item = await resolveRedeemable(organizationId, itemId, kind);
  if (!item) {
    throw createHttpError("That reward isn't available here.", 404);
  }
  if (!item.available) {
    throw createHttpError("That reward is out of stock right now.", 400);
  }

  const priceCenti = item.priceCenti;
  const session = await mongoose.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const now = new Date();
      await consumeDynamicQrToken({ token, organizationId, session, purpose: "redeem" });
      await settleExpiryInTransaction({ session, organizationId, userId, now });

      // The $gte guard IS the sufficient-funds check — checking the balance
      // first and deducting after would let two concurrent redeems both pass
      // the check. No match means not enough points, so the balance can never
      // go negative.
      const updated = await PointsBalance.findOneAndUpdate(
        { userId, organizationId, balanceCenti: { $gte: priceCenti } },
        {
          $inc: { balanceCenti: -priceCenti },
          $set: { lastActivityAt: now, expiresAt: expiryAtFrom(program, now) }
        },
        { new: true, session }
      );

      if (!updated) {
        const current = await PointsBalance.findOne({ userId, organizationId }).session(session);
        const have = toPoints(effectiveBalanceCenti(current, now));
        throw createHttpError(
          `Not enough points — ${item.name} costs ${toPoints(priceCenti)} and you have ${have}.`,
          400
        );
      }

      await PointsTransaction.create(
        [
          {
            organizationId,
            userId,
            type: "redeem",
            pointsCenti: -priceCenti,
            balanceAfterCenti: updated.balanceCenti,
            rewardKind: item.kind,
            rewardRef: item.doc._id,
            rewardName: item.name,
            token,
            createdAt: now
          }
        ],
        { session }
      );

      responsePayload = {
        success: true,
        message: `Enjoy your ${item.name}!`,
        data: {
          rewardName: item.name,
          pointsSpent: toPoints(priceCenti),
          balance: toPoints(updated.balanceCenti)
        }
      };
    });

    return responsePayload;
  } finally {
    session.endSession();
  }
};

// --- reads ------------------------------------------------------------

const getPointsBalanceByUserId = async (userId, organizationId) => {
  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  const org = await loadOrganizationOrThrow(organizationId);
  const program = await loadProgram(org);

  const balance = await PointsBalance.findOne({ userId, organizationId });
  const now = new Date();
  const { multiplier, campaign } = await resolveActiveMultiplier(organizationId, now);

  return {
    success: true,
    data: {
      balance: toPoints(effectiveBalanceCenti(balance, now)),
      lastActivityAt: balance ? balance.lastActivityAt : null,
      expiresAt: expiresAtFor(balance),
      earnPercent: program.earnPercent,
      pointsExpiryDays: program.pointsExpiryDays,
      // Null unless something is live right now — the dashboard shouldn't
      // have to re-derive "is a campaign on".
      multiplier,
      activeCampaign: campaign ? { name: campaign.name, multiplier: campaign.multiplier } : null
    }
  };
};

const formatTransaction = (txn) => ({
  id: txn._id.toString(),
  type: txn.type,
  points: toPoints(txn.pointsCenti),
  balanceAfter: toPoints(txn.balanceAfterCenti),
  billAmount: txn.billAmount,
  rewardName: txn.rewardName || "",
  // Tied to campaignName, not to the multiplier's own value: gating on
  // `!== 1` would leave campaignName set but multiplier null for a
  // (permitted, if pointless) 1x campaign, and the UI interpolates
  // `${multiplier}x` right next to the name — that reads "(nullx)".
  // Both fields are present together or absent together.
  campaignName: txn.campaignName || null,
  multiplier: txn.campaignName ? txn.multiplier : null,
  createdAt: txn.createdAt
});

const getPointsHistoryByUserId = async (userId, organizationId, limit = 50) => {
  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  const rows = await PointsTransaction.find({ userId, organizationId }).sort({ createdAt: -1 });
  return { success: true, data: rows.slice(0, limit).map(formatTransaction) };
};

// The outlet's whole ledger, newest first — the admin transaction history.
// startDate/endDate are both optional and, deliberately, do nothing unless
// at least one is passed: AdminOverview's live-activity feed polls this with
// neither, and must keep seeing the true most-recent rows, not a trailing-
// 30-day window it never asked for. The Transactions page and its Excel
// export are the only callers that ever pass a range.
const getOutletTransactions = async (organizationId, { limit = 100, startDate, endDate } = {}) => {
  let rows = await PointsTransaction.find({ organizationId }).sort({ createdAt: -1 });
  if (startDate || endDate) {
    const { start, end } = resolveDateRange(startDate, endDate);
    rows = rows.filter((t) => {
      const createdAt = new Date(t.createdAt);
      return createdAt >= start && createdAt <= end;
    });
  }
  const capped = rows.slice(0, limit);

  const userIds = [...new Set(capped.map((r) => r.userId.toString()))];
  const users = await Promise.all(userIds.map((id) => User.findOne({ _id: id, organizationId })));
  const nameById = new Map(users.filter(Boolean).map((u) => [u._id.toString(), u.name]));

  return {
    success: true,
    data: capped.map((txn) => ({
      ...formatTransaction(txn),
      customerId: txn.userId.toString(),
      customerName: nameById.get(txn.userId.toString()) || "Unknown"
    }))
  };
};

const getCustomerDetailRows = async (organizationId) => {
  const org = await loadOrganizationOrThrow(organizationId);
  const program = await loadProgram(org);
  const now = new Date();

  const customers = await User.find({ role: "customer", organizationId })
    .populate("customerAccountId")
    .sort({ name: 1 });

  const rows = await Promise.all(
    customers.map(async (customer) => {
      const balance = await PointsBalance.findOne({ userId: customer._id, organizationId });
      const allTxns = await PointsTransaction.find({ userId: customer._id, organizationId })
        .sort({ createdAt: -1 });

      const earns = allTxns.filter((t) => t.type === "earn");
      const redeems = allTxns.filter((t) => t.type === "redeem");

      const totalSpent = earns.reduce((sum, t) => sum + (t.billAmount || 0), 0);
      const lifetimePointsCenti = earns.reduce((sum, t) => sum + t.pointsCenti, 0);

      const idStr = customer._id.toString();
      const suffix = idStr.substring(Math.max(0, idStr.length - 5)).toUpperCase();
      const formattedId = `NO. ${suffix.padStart(5, "0")}`;

      const account = customer.customerAccountId;
      const customerAccountIdStr = account ? (account._id ? account._id.toString() : account.toString()) : null;
      const avatarVersion = account && account.avatarVersion ? account.avatarVersion : 0;

      return {
        id: idStr,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        address: customer.address || "",
        customerNo: formattedId,
        customerAccountId: customerAccountIdStr,
        avatarVersion: avatarVersion,
        pointsBalance: toPoints(effectiveBalanceCenti(balance, now)),
        lifetimePoints: toPoints(lifetimePointsCenti),
        lastActivityAt: balance ? balance.lastActivityAt : null,
        redemptionCount: redeems.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        // Kept as "recent activity" for the customer-detail drawer.
        history: allTxns.slice(0, 10).map(formatTransaction)
      };
    })
  );

  return rows.filter((r) => r.history.length > 0);
};

module.exports = {
  generateQRToken,
  generateRedeemToken,
  claimPoints,
  redeemPoints,
  getRedeemCatalog,
  resolveRedeemable,
  getPointsBalanceByUserId,
  getPointsHistoryByUserId,
  getOutletTransactions,
  getCustomerDetailRows,
  // Reused by pendingClaimService — same logic, no duplication.
  consumeDynamicQrToken,
  awardPointsInTransaction,
  loadOrganizationOrThrow,
  loadProgram,
  // Exported for reports, which must apply the same lazy expiry on read.
  isExpiredNow,
  effectiveBalanceCenti,
  expiresAtFor,
  expiryAtFrom,
  settleExpiryInTransaction
};
