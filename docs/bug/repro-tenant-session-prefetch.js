/**
 * Standalone verification for the tenant-session prefetch (P4 of
 * docs/bug/2026-08-14-stale-sw-and-csp-report-storm.md).
 *
 * Before: TenantSessionSync is a CHILD of TenantProvider, and TenantProvider
 * returns a full-screen spinner (rendering no children) until /api/tenant
 * resolves. So the tenant-JWT exchange could not even START until that query
 * came back, making a cold dashboard load three serial round trips deep:
 *
 *   index.html + bundle -> GET /api/tenant -> POST enter-tenant -> /api/points/*
 *
 * The exchange never needed /api/tenant: the backend resolves the outlet from
 * the X-Company-Slug/X-Outlet-Slug headers TenantProvider sets synchronously
 * from the URL (middleware/tenantMiddleware.js extractTenantRef), not from any
 * id the client sends. After: TenantProvider fires the exchange itself, with a
 * null organizationId, concurrently with the tenant query.
 *
 * The null id is the whole subtlety, and it is what this script pins down.
 * ensureTenantSession's skip test is `!cachedOrgId || cachedOrgId !== orgId`.
 * With orgId null and a cached JWT present that is ALWAYS true, so a naive
 * early call would exchange on every single outlet open — turning the revisit
 * case from zero network calls into one, i.e. trading the round trip we just
 * saved straight back. So the early call bails unless there is no cached
 * tenant JWT at all: the one case where the exchange is needed regardless of
 * what the id turns out to be.
 *
 * Run: node docs/bug/repro-tenant-session-prefetch.js
 */

// Mirrors the decision logic in CustomerAuthContext.ensureTenantSession.
// Returns the list of POSTs that would be issued, in order.
function makeSession({ prefetch, cachedOrgId, globalSession = true }) {
  const posts = [];
  const inFlight = new Map();
  let latestRequestKey = null;
  let storedOrgId = cachedOrgId;

  function ensureTenantSession(tenantKey, tenantOrgId) {
    const requestKey = tenantKey;
    latestRequestKey = requestKey;

    if (inFlight.has(requestKey)) return inFlight.get(requestKey);
    if (!globalSession) return null;

    const needExchange = !storedOrgId || storedOrgId !== tenantOrgId;

    // The early-call guard under test.
    if (tenantOrgId === null && storedOrgId) return null;
    if (!needExchange) return null;

    posts.push({ tenantKey, forOrgId: tenantOrgId });
    const p = {
      settle(resolvedOrgId) {
        inFlight.delete(requestKey);
        // The isolation guard: a response for an outlet the user has since
        // navigated away from must never be applied to the shared JWT slot.
        if (latestRequestKey !== requestKey) return "discarded";
        storedOrgId = resolvedOrgId;
        return "applied";
      },
    };
    inFlight.set(requestKey, p);
    return p;
  }

  return {
    posts,
    tokenOrgId: () => storedOrgId,
    // A page load: TenantProvider fires early (id unknown), then
    // TenantSessionSync fires once /api/tenant resolves (id known).
    openOutlet(tenantKey, orgId) {
      const early = prefetch ? ensureTenantSession(tenantKey, null) : null;
      return { early, late: () => ensureTenantSession(tenantKey, orgId) };
    },
  };
}

function assert(cond, msg, detail) {
  if (!cond) throw new Error("FAIL: " + msg + (detail ? ` (${detail})` : ""));
  console.log("PASS " + msg);
}

console.log("== Case 1: first entry, no cached tenant JWT ==");
{
  const before = makeSession({ prefetch: false, cachedOrgId: null });
  const b = before.openOutlet("acme/thamel", "orgT");
  b.late().settle("orgT");
  assert(
    before.posts.length === 1 && before.posts[0].forOrgId === "orgT",
    "pre-fix: the single exchange can only start AFTER /api/tenant resolves (serial)",
  );

  const after = makeSession({ prefetch: true, cachedOrgId: null });
  const a = after.openOutlet("acme/thamel", "orgT");
  assert(Boolean(a.early), "post-fix: the exchange starts BEFORE /api/tenant resolves (concurrent)");
  a.late();
  a.early.settle("orgT");
  assert(
    after.posts.length === 1,
    "post-fix: the late call joins the in-flight exchange instead of issuing a second POST",
    `posts=${after.posts.length}`,
  );
  assert(after.tokenOrgId() === "orgT", "post-fix: the exchanged JWT is applied");
}

console.log("\n== Case 2: revisit, cached JWT already for THIS outlet ==");
{
  const after = makeSession({ prefetch: true, cachedOrgId: "orgT" });
  const a = after.openOutlet("acme/thamel", "orgT");
  a.late();
  assert(
    after.posts.length === 0,
    "no request is added to a revisit: the early call bails on a null id, the late call takes the existing skip path",
    `posts=${after.posts.length}`,
  );
}

console.log("\n== Case 3: outlet switch, cached JWT belongs to the OTHER outlet ==");
{
  const after = makeSession({ prefetch: true, cachedOrgId: "orgA" });
  const a = after.openOutlet("acme/durbarmarg", "orgB");
  assert(
    after.posts.length === 0,
    "the early call does NOT exchange on a stale-but-present JWT — it cannot tell 'stale' from 'correct' without the id",
  );
  const late = a.late();
  assert(after.posts.length === 1, "the late call (real id) sees the mismatch and exchanges");
  late.settle("orgB");
  assert(after.tokenOrgId() === "orgB", "the JWT ends up scoped to the outlet actually on screen");
}

console.log("\n== Case 4: isolation — rapid A -> B navigation ==");
{
  const s = makeSession({ prefetch: true, cachedOrgId: null });
  const a = s.openOutlet("acme/thamel", "orgA");
  const b = s.openOutlet("acme/durbarmarg", "orgB");
  // B's request became the latest while A's was still in flight.
  assert(a.early.settle("orgA") === "discarded", "a late response for the outlet left behind is DISCARDED");
  assert(b.early.settle("orgB") === "applied", "the response for the outlet on screen is applied");
  assert(
    s.tokenOrgId() === "orgB",
    "the shared JWT slot ends up holding the ON-SCREEN outlet's token, not whichever POST resolved last",
  );
}

console.log("\nAll checks passed.");
