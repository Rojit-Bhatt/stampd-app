const express = require("express");
const { startClaim, status, fulfill } = require("../controllers/claimController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/start", resolveTenant, startClaim);
router.get("/:pendingClaimId/status", resolveTenant, status);
// verifyToken only — NOT resolveTenant. Tenant comes exclusively from the
// JWT, exactly like /api/stamps/claim.
router.post("/:pendingClaimId/fulfill", verifyToken, fulfill);

module.exports = router;
