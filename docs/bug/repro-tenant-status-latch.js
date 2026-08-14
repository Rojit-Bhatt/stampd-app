/**
 * Standalone reproduction for "dashboard shows the previous outlet's data
 * after switching outlets from /explore" (no data-leak between customers —
 * confirmed backend always scopes strictly to the JWT — this is a frontend
 * timing bug that lets stale-JWT-scoped queries fire and poison the NEW
 * outlet's React Query cache entry).
 *
 * Root cause: TenantContext.tsx latches a `status` ref to avoid flashing
 * 404/error text during a background refetch of the SAME tenant query (a
 * real transient: isLoading:false, isError:false, data:undefined can occur
 * mid-refetch). The latch only updates on an unambiguous "tenant present"
 * or "errored" render — so when the customer switches to a DIFFERENT
 * outlet, the FIRST render for the new query key also has
 * (tenant:undefined, isError:false) — indistinguishable from the refetch
 * case the latch was built for — and the latch keeps reporting the OLD
 * outlet's "ready" status. TenantContext then passes `tenant: null` to
 * context instead of blocking on its own loading spinner.
 *
 * That `tenant: null` then defeats CustomerLayout's stale-session gate:
 * `sessionStale = Boolean(tenant) && tokenOrgId !== tenant?.id` reads
 * `Boolean(null) === false`, so the gate is skipped and `<Outlet/>` (and
 * every data hook inside it — usePointsBalance, useRewardCatalog, ...)
 * mounts and fires immediately, using whatever JWT is still in localStorage
 * (the PREVIOUS outlet's, since the token hasn't been re-exchanged yet).
 * Those requests come back scoped to the previous outlet's tenant (the
 * backend takes the tenant from the JWT, never the URL, on authenticated
 * routes) but get cached under the NEW outlet's query key — so the new
 * outlet's dashboard shows the old outlet's numbers, with no error and no
 * loading flash, until something else invalidates that cache entry.
 *
 * This script isolates the status-latch state machine (copied verbatim in
 * spirit from TenantContext.tsx) and replays the exact render sequence a
 * real outlet-A -> outlet-B switch produces, without needing a browser or a
 * test framework (the frontend has none set up). It fails against the
 * pre-fix logic and passes against the post-fix logic.
 *
 * Run: node docs/bug/repro-tenant-status-latch.js
 */

function makeLatch({ resetOnKeyChange }) {
  let status = "loading";
  let prevKey = null;
  return function render({ key, tenant, isError }) {
    if (resetOnKeyChange && key !== prevKey) {
      prevKey = key;
      status = "loading";
    } else if (!resetOnKeyChange) {
      prevKey = key;
    }
    if (tenant) status = "ready";
    else if (isError) status = "errored";
    return status;
  };
}

function sessionStale(tenant, tokenOrgId) {
  return Boolean(tenant) && tokenOrgId !== (tenant ? tenant.id : undefined);
}

// The exact render sequence a customer produces switching Magic Cups (A) ->
// Cafe Coffesarowar (B) via /explore, with the shared JWT still pointing at
// A until ensureTenantSession's re-exchange resolves.
const sequence = [
  { label: "mount on A, tenant query pending", key: "A", tenant: null, isError: false },
  { label: "A's tenant query resolves", key: "A", tenant: { id: "orgA" }, isError: false },
  { label: "navigate to B: NEW query key, pending", key: "B", tenant: null, isError: false },
  { label: "B's tenant query resolves", key: "B", tenant: { id: "orgB" }, isError: false },
];

function run(resetOnKeyChange) {
  const latch = makeLatch({ resetOnKeyChange });
  const tokenOrgId = "orgA"; // shared JWT slot, still A's, until re-exchanged
  const rows = sequence.map((step) => {
    const status = latch(step);
    const effectiveTenant = status === "ready" ? step.tenant : null;
    return {
      ...step,
      status,
      // What CustomerLayout actually receives as `tenant` from context.
      contextTenant: effectiveTenant,
      sessionStale: sessionStale(effectiveTenant, tokenOrgId),
    };
  });
  return rows;
}

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("PASS " + msg);
}

console.log("== Pre-fix latch (no reset on key change) ==");
const before = run(false);
before.forEach((r) => console.log(`  ${r.label} -> status=${r.status} sessionStale=${r.sessionStale}`));
const leakStep = before[2]; // "navigate to B: NEW query key, pending"
assert(
  leakStep.status === "ready" && leakStep.sessionStale === false,
  "reproduces the bug: switching to B while its tenant query is pending reads status=ready, sessionStale=false (gate bypassed, stale-JWT queries fire and poison B's cache)",
);

console.log("\n== Post-fix latch (reset status to loading on key change) ==");
const after = run(true);
after.forEach((r) => console.log(`  ${r.label} -> status=${r.status} sessionStale=${r.sessionStale}`));
const fixedStep = after[2];
assert(
  fixedStep.status === "loading",
  "fix holds: switching to B while its tenant query is pending reads status=loading (TenantProvider renders its own spinner, CustomerLayout/Outlet never mounts, no stale-JWT query can fire)",
);
assert(
  after[3].status === "ready" && after[3].sessionStale === true,
  "fix doesn't regress the real bug #68: once B's tenant loads, sessionStale correctly reads true (tokenOrgId=orgA vs tenant.id=orgB) so CustomerLayout shows its own auth spinner until ensureTenantSession re-exchanges the JWT",
);

console.log("\nAll checks passed.");
