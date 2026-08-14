const express = require("express");
const { startClaim, status, fulfill } = require("../controllers/claimController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { verifyToken } = require("../middleware/authMiddleware");
const { validateBody } = require("../middleware/validateBody");
const { fulfillClaimSchema } = require("../middleware/validateSchemas");

const router = express.Router();

router.post("/start", resolveTenant, startClaim);
router.get("/:pendingClaimId/status", resolveTenant, status);
// verifyToken only — NOT resolveTenant. Tenant comes exclusively from the
// JWT, exactly like /api/stamps/claim.
// claimSecret is the proof that this caller burned the QR token — without
// it an unclaimed row must never bind (pendingClaimService). Validated at
// the route so the handler receives a cleaned body and nothing else.
router.post("/:pendingClaimId/fulfill", verifyToken, validateBody(fulfillClaimSchema), fulfill);

module.exports = router;
