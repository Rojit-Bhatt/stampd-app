const TenantAuditLog = require("../models/TenantAuditLog");
// Write-only tenant audit ledger (see models/TenantAuditLog.js for the
// model's rationale). No list endpoint in phase 1 — the contract is
// "every listed action leaves a row", not "read them back".
//
// Sequence is per-company rather than global: each business is its own
// ledger, so numbering never drifts when two businesses act simultaneously,
// and per-company ordering is what a later read endpoint would want anyway.
const logAction = async ({ companyId, organizationId, actorId, actorName, actorRole, action, targetId, meta }) => {
  try {
    const sequence = await TenantAuditLog.countDocuments({ companyId });
    await TenantAuditLog.create({
      companyId,
      organizationId,
      action,
      actorId: actorId || null,
      actorName: actorName || "",
      actorRole: actorRole || "",
      targetId: targetId || null,
      meta: meta || null,
      sequence
    });
  } catch (error) {
    // Audit logging must never fail the action it records: if the write
    // itself errors (schema drift, transient DB blip), log and continue so
    // a broken ledger can't block earning, redeeming, or paying.
    console.error("[TenantAuditLog] write failed:", error?.message || error);
  }
};
module.exports = { logAction };
