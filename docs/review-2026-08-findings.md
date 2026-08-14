# August 2026 full-codebase review — findings and rationale

Companion record for the two-axis code review run in August 2026 (full report in `docs/superpowers/` working notes and the delivered report). This file exists so future readers — and CI comments — know *why* the lockfile/packaging changes below are the way they are.

## Why the frontend typecheck broke under pnpm but passed under npm

The root cause was a zod major-version collision between the two workspaces:

| Fact | Detail |
|---|---|
| Frontend schema lib | `zod` v3 (`3.25.76`), pinned in `frontend/package.json` |
| Backend schema lib | `zod` v4 (`4.4.3`), declared in `backend/package.json` |
| Validator | `@hookform/resolvers` — v3.10.0 peers on zod 4; v3.9.1 peers on zod 3 |

Under pnpm, the two zod majors coexist in the shared virtual store, and pnpm's strict dependency resolution leaves `@hookform/resolvers`'s zod peer *unlinked* in its own virtual scope. TypeScript's module resolution then walks up to the root `node_modules`, where the **backend's zod v4** wins the hoist — so the frontend's zod 3 schemas are checked against zod 4's type surface (the `$ZodTypeInternals` mismatch). Under npm, the flat hoisted layout happened to put zod 3 at the root, masking the collision. CI's npm-based `quality.yml` stayed green while the pnpm path (the one Cloudflare Pages actually uses) failed on a fresh install.

## The fix, and why it is safe

1. **`frontend/package.json`:** `@hookform/resolvers` pinned to `~3.9.1` — the last minor that peers on zod 3.
2. **Root `package.json`:** `"pnpm": { "overrides": { "zod": "^3.25.0" } }` — forces a single zod major across the whole workspace.
3. **Safety audit before merging the override:** every backend zod usage was inspected (`grep` of `z.*` across services/controllers/middleware/models/utils). The backend uses only zod 3-compatible APIs: `z.string`, `z.object`, `z.record`, `z.any`, `z.union`, `z.enum`, `z.number`, `z.null`, `z.boolean` plus `.refine`/`.optional`. No zod 4-only APIs (`z.custom`, `z.coerce`, `z.lazy`, `z.pipe`, `z.brand`, `z.discriminatedUnion`, `.catch`) appear anywhere.
4. **Verification:** `tsc --noEmit` exits 0 on fresh installs under both package managers; the full 68-suite backend run passes under the single zod version; both lockfiles regenerated in sync.

## What was NOT fixed, and why

- **`exceljs` → `uuid` moderate vulnerability (GHSA-w5hq-g745-h8pq).** It is a *nested* transitive dependency of `exceljs`. npm does not support package-path overrides (`"exceljs/uuid"` is rejected as an override without a name), so there is no in-repo workaround; the fix is an upstream exceljs release bumping uuid. Exposure is low — the vulnerable code path requires a caller-supplied `buf` on v3/v5/v6 UUIDs, and exceljs calls `v4()` with no arguments in Stampd's usage.
- **Security-roadmap T1 (per-tenant SMS spend quota).** Rate limiting shipped; the spend cap needs a server-side model decision (per-organization monthly SMS budget, enforcement point) before implementation. Deferred intentionally — not a code defect.
- **Unused-looking `redis` dependency.** Kept: `backend/middleware/rateLimitMiddleware.js` uses it when `REDIS_URL` is set (Cloudflare-side rate limiting integration). The dependency only activates with configuration; removing it would delete a live capability.

## CI note

`build.yml` (pnpm/production path) gained a `tsc --noEmit` step after the frozen-lockfile check, so this exact failure mode now fails the branch check rather than reaching Cloudflare Pages. The npm-based `quality.yml` job continues to cover lint/typecheck/build on the npm resolution.
