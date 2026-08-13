// Daily sanity checksum (G11 — backups/DR detectability).
//
// A database can be "online" yet quietly corrupt: a stray delete that halves
// the transaction log, a bad migration that wipes balances. Automated
// backups will happily preserve the corruption, so the corruption check
// itself must be cheap, deterministic and pollable.
//
// This module computes a tiny "sanity digest" over the whole business state:
//   - row counts for the core collections (customer accounts, orgs,
//     companies, transactions, balances, claims)
//   - the aggregate points balance across every PointsBalance row
//   - the most recent transaction date
// The digest is then hashed (sha256) so an operator or CI job can store
// yesterday's value and fail loudly when it diverges beyond an expected
// delta — a corrupted or truncated DB produces a DIFFERENT digest even if
// the service stays up.
//
// Zero infrastructure: no cron, no queue, no scheduler. Operators or a
// scheduled platform-external check (GitHub Actions cron, UptimeRobot,
// Render cron) hit the platform-admin endpoint once a day. Keeping it
// pull-based means no new moving parts in this service and no test-time
// timers.
const crypto = require("crypto");
const CustomerAccount = require("../models/CustomerAccount");
const Organization = require("../models/Organization");
const Company = require("../models/Company");
const PointsBalance = require("../models/PointsBalance");
const PointsTransaction = require("../models/PointsTransaction");
const PendingClaim = require("../models/PendingClaim");

const count = (Model) => Model.countDocuments();

const buildDigest = async () => {
  const [
    customers, organizations, companies, balances, transactions, claims,
    totalPointsAgg, latestTx
  ] = await Promise.all([
    count(CustomerAccount),
    count(Organization),
    count(Company),
    count(PointsBalance),
    count(PointsTransaction),
    count(PendingClaim),
    // Reduced in JS rather than aggregated, because the in-memory mock DB
    // used by the test suites has no aggregation pipeline — same convention
    // as platformAnalyticsService. No .lean(): the mock driver's cursor
    // surface is deliberately minimal, so the array itself is iterated.
    PointsBalance.find({}),
    // Chaining-free: the in-memory mock driver supports only the flat
    // Model.find(query) / Model.findOne(query) surface.
    PointsTransaction.find({}).sort({ createdAt: -1 })
  ]);

  // mock mongoose rows carry only plain fields, so either path works
  // with direct property access.
  const rows = Array.isArray(totalPointsAgg) ? totalPointsAgg : [];
  const totalPointsCenti = rows.reduce((sum, b) => sum + (Number(b.balanceCenti) || 0), 0);
  const latestTxRow = Array.isArray(latestTx) ? latestTx[0] : latestTx;
  const latestTxAt = latestTxRow?.createdAt || null;

  // Deterministic payload — same state always yields the same digest.
  const payload = {
    customers, organizations, companies, balances, transactions, claims,
    totalPointsCenti: String(totalPointsCenti),
    latestTxAt: latestTxAt ? latestTxAt.toISOString() : null
  };

  const json = JSON.stringify(payload);
  const sha256 = crypto.createHash("sha256").update(json).digest("hex");

  return { ...payload, sha256 };
};

module.exports = { buildDigest };
