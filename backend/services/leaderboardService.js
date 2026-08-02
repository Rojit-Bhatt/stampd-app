const PointsTransaction = require("../models/PointsTransaction");
const User = require("../models/User");
const { toPoints } = require("../utils/pointsMath");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Trailing rolling windows, not calendar-aligned — matches getDashboardStats'
// (reportService.js) and tierService's existing "how recently" precedent
// rather than inventing PLATFORM_TIMEZONE-aware calendar month/week math.
// See the design spec's "Window semantics" section for the full reasoning.
const WINDOW_MS = {
  all: null,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS
};

// Ranked by points EARNED, never PointsBalance — a customer who redeemed
// everything they earned must not rank lower for having spent it. Always
// returns full names; the customer-facing route redacts one layer up
// (pointsController.js), never here, since this function is shared by both
// the admin and customer routes.
const getLeaderboard = async (organizationId, { window = "all", limit = 10 } = {}) => {
  if (!organizationId) {
    throw createHttpError("A business context is required.", 400);
  }
  if (!(window in WINDOW_MS)) {
    throw createHttpError("Unknown leaderboard window.", 400);
  }

  const query = { organizationId, type: "earn" };
  const windowMs = WINDOW_MS[window];
  if (windowMs !== null) {
    query.createdAt = { $gte: new Date(Date.now() - windowMs) };
  }

  const earns = await PointsTransaction.find(query);

  const totalsByUser = new Map();
  for (const txn of earns) {
    const key = txn.userId.toString();
    totalsByUser.set(key, (totalsByUser.get(key) || 0) + txn.pointsCenti);
  }

  if (totalsByUser.size === 0) return [];

  const userIds = [...totalsByUser.keys()];
  const users = await Promise.all(userIds.map((id) => User.findOne({ _id: id, organizationId })));
  const customerById = new Map(
    users.filter((u) => u && u.role === "customer").map((u) => [u._id.toString(), u])
  );

  return userIds
    .filter((id) => customerById.has(id))
    .map((id) => ({
      userId: id,
      name: customerById.get(id).name,
      pointsEarned: toPoints(totalsByUser.get(id))
    }))
    .sort((a, b) => (b.pointsEarned !== a.pointsEarned ? b.pointsEarned - a.pointsEarned : a.name.localeCompare(b.name)))
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
};

// "Bikash Thapa" -> "Bikash T." A mononym ("Cher") has no last name to
// initial, so it's returned as-is rather than fabricating one.
const formatDisplayName = (fullName) => {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

module.exports = { getLeaderboard, formatDisplayName };
