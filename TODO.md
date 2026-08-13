# TODO

## Review-driven items (Aug 2026)
- RESOLVED 2026-08: Frontend typecheck broken on fresh pnpm install — `@hookform/resolvers` 3.10.0 (zod 4 peer) was pulled into the shared pnpm store next to the backend's zod 4, so the frontend's zod 3 resolver types collided. Fixed by pinning `@hookform/resolvers` to `~3.9.1` in frontend/package.json plus a root `pnpm.overrides` forcing zod ^3.25.0 workspace-wide (the backend was audited and uses only zod 3-compatible APIs). Both npm and pnpm now typecheck clean; lockfiles for both managers regenerated.
- RESOLVED 2026-08: Company rollup silently undercounted same-day customers under explicit date ranges (timezone-boundary bug) — fixed upstream by the timezone commit of 2026-08-13; `tests/company-reports-range.js` passes in both UTC and Asia/Kathmandu.
- RESOLVED 2026-08: WhatsApp prefill (bug-fix B3) completed — every "Talk to us" entry point now uses `api.whatsapp.com/send` with a context-appropriate pre-filled message (landing nav/CTAs, footer, review-QR page, subscription panel, chat float).
- RESOLVED 2026-08: "Customers" count ambiguity — dashboard and reports carry hover tooltips distinguishing registered customer accounts from the points-earned customer list.
- KNOWN: `exceljs` carries a moderate-severity `uuid` vulnerability (GHSA-w5hq-g745-h8pq) as a nested transitive dependency; npm overrides cannot reach it (package-path overrides are unsupported), so the fix is an upstream exceljs release bumping uuid. Low exposure: the affected code path requires a caller-supplied `buf` on v3/v5/v6 UUIDs, which Stampd does not use (exceljs calls `v4()` with no arguments). Re-check when Dependabot proposes an exceljs bump.
- OPEN (needs a design decision first): Security-roadmap T1 — per-tenant SMS spend quota. Rate limiting exists; the spend cap does not. Decide the server-side model (per-organization monthly SMS budget and enforcement point) before building.

01. Compress API responses in transit
Check whether API responses are compressed in transit. Enable gzip or brotli compression on the server or edge for JSON and text responses above a small size threshold, and confirm the client negotiates it via Accept-Encoding. Avoid double-compressing already-compressed payloads. Verify response transfer sizes drop significantly and responses still parse correctly on the client.

02. Batch inserts and updates
Find code that performs many individual INSERT or UPDATE statements in a loop where a single batched operation would work. Replace them with bulk/batched writes (multi-row inserts, batch updates, or a single statement) inside an appropriate transaction. Chunk very large batches to avoid oversized statements or long locks. Verify write-heavy operations complete far faster with fewer round trips.

03. Add a circuit breaker for slow dependencies
Identify external dependencies whose slowness or failures could cascade into the app, exhausting threads or connections while everyone waits. Add a circuit breaker that trips when a dependency is failing or too slow, fast-failing or serving a fallback until it recovers, with timeouts and limited concurrency to that dependency. Verify that a degraded dependency no longer drags down unrelated parts of the app and recovers cleanly.

04. Apply optimistic UI updates
Identify user actions (likes, toggles, adds, edits, deletes) that currently wait for the server response before updating the screen. Make them optimistic: update the UI immediately as if the action succeeded, then reconcile with the server result and roll back gracefully if it fails. Include clear error handling and a visible rollback so users aren't misled. Verify the happy path feels instant and failures restore the correct state.

05. Cache rendered pages or fragments
Find server-rendered pages or fragments whose output is identical (or nearly so) across many users and changes infrequently. Cache the rendered output and serve it directly, regenerating on a schedule or on content change, while keeping personalized regions dynamic via holes or client-side hydration. Ensure cache keys account for meaningful variations like locale. Verify these pages serve much faster and rendering load decreases.
