const User = require("../models/User");
const {
  convertTokenToPendingClaim,
  getClaimStatus,
  fulfillPendingClaim
} = require("../services/pendingClaimService");

const createHttpError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const startClaim = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) throw createHttpError("QR token is required.", 400);
    const result = await convertTokenToPendingClaim({ token, organizationId: req.organizationId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const status = async (req, res, next) => {
  try {
    const result = await getClaimStatus({
      pendingClaimId: req.params.pendingClaimId,
      organizationId: req.organizationId,
      // A query param, not a body: this is a GET the claim page polls.
      claimSecret: req.query.secret
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// verifyToken-gated: tenant comes exclusively from the JWT (req.user), never
// from X-Tenant-Slug/:slug — the same hard security invariant every other
// authenticated loyalty route in this app relies on.
const fulfill = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.user.id });
    if (!user || !user.customerAccountId) {
      throw createHttpError("Account not found.", 404, "ACCOUNT_NOT_FOUND");
    }
    const result = await fulfillPendingClaim({
      pendingClaimId: req.params.pendingClaimId,
      organizationId: req.user.organizationId,
      customerAccountId: user.customerAccountId.toString(),
      claimSecret: req.body.claimSecret
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { startClaim, status, fulfill };
