# Health endpoints, error observability, and long-term maintenance

**Date:** 2026-08-04
**Status:** Approved design, ready for implementation plan
**Scope:** Real health-check endpoints (liveness/readiness/admin detail), Sentry error monitoring tagged with this app's tenancy, per-request logging with correlatable error IDs, CI that actually runs the test suite, automated dependency updates, and a written maintenance runbook. Does NOT introduce performance tracing, log aggregation services, alerting beyond Sentry's built-in rules, or any new infrastructure (Redis, queues, agents).

## Context

The app is about to deploy (Render backend, Cloudflare Pages frontend — see
`2026-07-19-production-scalability-hardening-design.md`). Auditing what exists today for
operating it after launch:

- **No health endpoint.** `GET /` returns `{success:true, message}` with a 200 whenever the
  Node process is alive — including when Mongo is unreachable and the server cannot serve a
  single real request. The hardening spec's decision 5 designated this as the host's
  health-check path. That is a liveness signal being used as a readiness signal.
- **No error monitoring.** Every failure path is `console.error`, visible only in Render's log
  viewer, only if someone is watching it. There is no grouping, no dedup, no notion of how many
  users an error touched, and no way to correlate a user's report with a log line. The hardening
  spec's decision 6 flagged Sentry as a fast-follow and deliberately left it unbuilt.
- **No request logging.** Nothing records that a request happened, how long it took, or which
  tenant it belonged to.
- **No CI.** `.github/` does not exist. `backend/tests/` holds a chained suite whose central
  member is `multi-tenant-isolation.js` — the only automated enforcement of the invariant the
  entire product depends on — and nothing forces it to run before a merge or a deploy.
- **No dependency automation.** The `xlsx` ban (CVEs GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9)
  is enforced by a CLAUDE.md sentence and human memory.
- **No written operational knowledge.** The failure modes are known — Render's free tier blocks
  outbound SMTP, a missing `MONGODB_URI` silently falls back to the mock DB, Atlas M0 has no
  automated backups — but they live in CLAUDE.md prose and in commit messages, not in anything
  shaped like a runbook.

Two existing documents are affected and are corrected as part of this work rather than left to
drift (see "Documentation corrections" at the end).

## Decisions locked during brainstorming

1. **Liveness and readiness are separate endpoints.** `/healthz` does no I/O; `/readyz` checks
   the database. Conflating them means a slow or briefly-unreachable Atlas causes the host to
   kill and restart a process that was fine, which makes an outage worse rather than shorter.
2. **The HTTP status code carries the health signal, not the body.** `200` for pass/warn, `503`
   for fail. Load balancers and orchestrators read the code. A `200` whose body says `"fail"` is
   invisible to every piece of infrastructure that matters.
3. **The readiness DB probe is an ordinary Mongoose query, not an admin ping.** The in-memory
   mock (`utils/mockMongoose.js`) has no `connection.db.admin()`, so a real ping would make the
   readiness endpoint work in production and throw in dev and in every test. A top-level-equality
   `findOne` works identically on both and exercises the actual query path.
4. **Error monitoring is Sentry, tagged with this app's tenancy.** Sentry's own grouping,
   dedup, users-affected counts, release health, and breadcrumbs are the parts that are expensive
   to build and cheap to buy. The part Sentry cannot know — which company, which outlet, which
   role — is supplied by this codebase. Rejected: a homegrown `ErrorLog` model plus a platform
   console page. It would know tenancy natively but would require rebuilding grouping, dedup,
   retention, and alerting, and would lose its own data in the failure mode where the server dies.
5. **Sentry receives IDs only, never identity.** `beforeSend` scrubs email, phone, password,
   tokens, claim secrets, and the `Authorization` header. This is not generic PII hygiene — it is
   the same invariant the rest of the architecture enforces. Unscrubbed, Sentry becomes the one
   surface where "this customer is also a customer of two competitors" is visible, which is
   precisely what per-tenant isolation exists to prevent.
6. **Only genuine incidents reach Sentry:** `statusCode >= 500 || !error.statusCode`. A 404, a
   400 validation failure, an expired QR token, a `CLAIM_ALREADY_FULFILLED` are ordinary business
   outcomes. Sending them would exhaust the free tier's monthly budget with noise and bury the
   real crashes.
7. **No performance tracing.** `tracesSampleRate: 0`. The free tier's quota goes entirely to
   errors. Revisit only if a latency problem appears that logs cannot explain.
8. **CI runs the existing suite; it does not add a framework.** The tests are plain
   `node tests/*.js` scripts by design. CI runs `npm test -w backend` exactly as a human would.

## Explicitly out of scope

- Log aggregation (Datadog, Better Stack, Logtail). Render's log viewer plus Sentry covers this
  traffic level; structured JSON logs mean adding a shipper later is config, not a rewrite.
- Sentry performance tracing, session replay, cron monitoring (decision 7).
- Alerting beyond Sentry's built-in issue-alert rules and UptimeRobot email.
- A status page, public or internal.
- Any change to the loyalty model, the points math, or the tenant-resolution boundary.

---

## 1. Health endpoints

Three endpoints across the standard layering (`routes/ → controllers/ → services/`).

### `backend/services/healthService.js` (new)

Three exported functions, no Express types in any of them.

**`getLiveness()`** — synchronous, no I/O:

```js
{ status: "pass", uptimeSeconds: 1234, time: "2026-08-04T02:53:11.204Z" }
```

**`getReadiness()`** — probes the database:

```js
{
  status: "pass",                       // "pass" | "warn" | "fail"
  version: "0.1.0",                     // backend/package.json version
  releaseId: "653f83a",                 // see "Release identification" below
  time: "2026-08-04T02:53:11.204Z",
  checks: {
    mongodb: { status: "pass", observedValue: 12, observedUnit: "ms" }
  }
}
```

The body shape follows the `draft-inadarei-api-health-check` convention (`status` /
`releaseId` / `checks` keyed by component, each with `observedValue` + `observedUnit`), which is
what monitoring tools and humans already expect to read.

The probe is:

```js
await Promise.race([
  Company.findOne({ slug: "__healthcheck__" }),   // top-level equality: mock-safe
  rejectAfter(2000)
]);
```

`Company` is used rather than a loyalty model because it is the smallest collection and carries
no tenant scope. The query returns `null` — the result is irrelevant; that it completes is the
check. The 2s timeout is not optional: an un-timeouted probe turns the health endpoint into the
thing that hangs, and a hung health endpoint reads to the host as a hung server.

On timeout or error: `status: "fail"`, `checks.mongodb.status: "fail"`, `checks.mongodb.output`
set to the error message.

**`getDetail()`** — `getReadiness()` plus:

| Field | Source | Why it is worth surfacing |
|---|---|---|
| `node` | `process.version` | Confirms the deploy runtime matches `.node-version` |
| `env` | `NODE_ENV` | Catches a production deploy that never got the variable |
| `usingMockDb` | the flag `server.js` already computes | The single most dangerous silent misconfiguration in this codebase |
| `dbReadyState` | `mongoose.connection.readyState` | Distinguishes "never connected" from "connection dropped" |
| `emailProvider` | `"brevo" \| "smtp" \| "stub"` | Render's free tier blocks SMTP ports; this states which path is live rather than which was intended |
| `cron.dailyTriggers` | `{schedule, timezone, lastRunAt, lastRunStatus}` | The daily messaging job is invisible otherwise |
| `sentry` | `{enabled, environment, release}` | Confirms the DSN actually reached the deploy |

`usingMockDb` is computed in `server.js` today as a module-local `const`. It moves to
`config/runtime.js` (new, three lines) so `healthService` can read it without importing
`server.js` and creating a cycle.

`emailProvider` is derived by `emailService` exporting a small `getActiveProvider()` that applies
the same precedence its send path already uses (`BREVO_API_KEY` → `SMTP_HOST` → stub). Deriving
it a second time inside `healthService` would let the two drift, and a health endpoint that
reports a different provider than the one actually sending is worse than no field at all.

**Cron last-run tracking** requires `messagingService` to keep a module-level
`lastRunAt`/`lastRunStatus`, set by `runDailyTriggers`, read through an exported getter. This is
the first piece of in-process cross-request state in the backend, and the hardening spec
explicitly noted the absence of such state as what makes the app multi-instance-ready. The
exception is deliberate and narrow: it is diagnostic-only, never read by business logic, and
per-instance reporting is the correct semantics for a health endpoint (each instance reports its
own cron). It carries a comment saying exactly this, so a future reader does not mistake it for a
pattern to copy.

### `backend/controllers/healthController.js` (new)

Thin, per the layering rule. Three handlers. The readiness handler maps status to code:

```js
res.status(result.status === "fail" ? 503 : 200).json(result);
```

`warn` returns 200 — a degraded-but-serving instance must stay in rotation.

### `backend/routes/healthRoutes.js` (new)

`GET /healthz` and `GET /readyz`. Both unauthenticated: they expose uptime, a version string, and
a boolean, which is not a meaningful disclosure, and requiring auth would make them unusable by
the two consumers that matter (Render's probe and UptimeRobot).

`GET /api/platform/health` is added to `routes/platformRoutes.js` behind the existing
`isPlatformAdmin` guard, calling `getDetail()`. Everything that would be a disclosure lives only
here.

### `server.js` wiring

Mounted immediately after `express.json()` and **before** the production static-serving block.
The `app.get("*")` SPA fallback at `server.js:156` only excludes paths starting with `/api` and
`/__test__`; `/healthz` matches neither, so a later mount would be served the HTML shell in
production and pass a naive probe while returning the wrong content type. Express matches in
registration order, so mounting first is the whole fix — but it is load-bearing, not stylistic.

### Release identification

`releaseId` is `process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "unknown"`. Render
injects the former automatically. The same value is passed to Sentry as its `release`, so a
Sentry issue and a health response can be tied to the same deploy.

### Host configuration

Render's health-check path changes from `/` to `/readyz`. This supersedes decision 5 of the
hardening spec (see "Documentation corrections").

---

## 2. Sentry, tagged with this app's tenancy

### Backend

**`backend/instrument.js` (new)** — `Sentry.init(...)`, required as the literal first line of
`server.js`, before `dotenv` and before `express`. Sentry v8+ auto-instrumentation patches
modules at require time and silently does nothing if it initializes after them.

Because it precedes `dotenv.config()`, `instrument.js` calls `require("dotenv").config()` itself
first. That is idempotent — the second call in `server.js` is a no-op — and the alternative
(moving `dotenv` into `instrument.js` only) would make `server.js` depend on a file whose name
does not suggest it loads configuration.

Everything is gated on `SENTRY_DSN`. Unset means `init` is never called: dev, the entire test
suite, and any deploy that has not been given a DSN are byte-for-byte unaffected.

```js
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  release: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || undefined,
  tracesSampleRate: 0,
  beforeSend: scrubPii
});
```

**Tenant scope tagging** is the part that makes this useful rather than generic. A `tagScope(req)`
helper in `backend/middleware/observabilityMiddleware.js` sets:

```
user.id             = req.user.userId          // the per-outlet User._id
tags.organizationId = req.user.organizationId
tags.role           = req.user.role
tags.companyId      = <see below>
```

It cannot be a global middleware, because the tenant is not known until an auth middleware has
run, and which auth middleware runs is per-route. So `tagScope` is called at the tail of each of
the four: `authMiddleware.verifyToken`, `companyAuthMiddleware.verifyCompanySession`,
`customerAuthMiddleware.verifyGlobalSession`, and the platform guard path. Four call sites, one
line each. It is a no-op when Sentry is disabled.

**`companyId` is not on the tenant JWT.** Its payload is `{userId, role, organizationId}` — by
design, since the outlet is the security boundary and the company is not needed to enforce it.
So `tagScope` reads `companyId` from whichever source the route actually has: `req.company._id`
on `resolveTenant` routes, `req.companyId` on a company session, and otherwise omits the tag
rather than issuing a lookup. An extra `Organization` read on every tagged request, purely to
enrich a monitoring tag, is not a trade worth making — and `organizationId` alone already
identifies the outlet uniquely, which is the level incidents are triaged at. Sentry's search
groups by outlet either way; the company tag is a convenience where it is free.

The consequence is the answer to "how many users were affected": Sentry counts distinct
`user.id`, and `User._id` is a per-outlet membership row. The count is therefore **already
scoped to the outlet** with no additional query — a customer who visits three outlets is three
distinct users, which is the correct answer for an outlet-scoped incident and matches how the
rest of the system counts. (The one place this differs from a platform-wide count is the same
place `platformAnalyticsService` already documents: distinct `CustomerAccount`s, not summed
memberships. A platform-wide "unique humans affected" figure is not derivable from Sentry and is
deliberately not attempted.)

**`scrubPii`** removes, recursively, from the event body and from `request.headers`,
`request.data`, and every breadcrumb: `email`, `phone`, `password`, `passwordHash`, `token`,
`claimSecret`, `authorization`, `cookie`. `sendDefaultPii` stays `false`. The user object keeps
only `id`.

**Filtering — one capture path, not two.** The existing global error handler in `server.js` is
the only place an error is sent:

```js
const statusCode = error.statusCode || 500;
const errorId = statusCode >= 500 ? newErrorId() : null;
if (errorId) Sentry.captureException(error, { tags: { errorId } });
```

`Sentry.setupExpressErrorHandler(app)` is deliberately **not** registered. Two capture paths
would either double-report every 5xx or force the errorId to be generated before the handler
that owns it — and the reason to use Sentry's handler at all (attaching request context) is
already covered: the v8 HTTP integration maintains an isolation scope per request, so an
exception captured inside the existing handler still carries the request, the breadcrumbs, and
the tags `tagScope` set. One handler, one capture, one id.

Also captured, outside the request path: `process.on("unhandledRejection")` and
`uncaughtException`, which today would take the process down with only a console line.

### Frontend

`@sentry/react`, initialized in `main.tsx`, gated on `VITE_SENTRY_DSN`. Wired into the
**existing** `components/ErrorBoundary.tsx` via `componentDidCatch` calling
`Sentry.captureException` — not a second `Sentry.ErrorBoundary` wrapper, which would duplicate the
boundary already in the tree.

Tenant tags are set from `TenantContext` once it resolves (`companySlug`, `outletSlug`), and
`Sentry.setUser({id})` from the session on login, cleared on logout. Same scrub rule: slugs and
IDs, never email or phone.

`ignoreErrors` covers the standard browser noise that is not actionable: `ResizeObserver loop
limit exceeded`, `Non-Error promise rejection captured`, and extension-injected script errors.

Source maps are uploaded at build time via `@sentry/vite-plugin`, gated on an auth token being
present so a local `npm run build` without one still succeeds.

---

## 3. Error IDs and request logging

### Error IDs

`backend/utils/errorId.js` — an 8-character hex id from `crypto.randomBytes(4)`.

The global error handler generates one for every 5xx and puts it in three places: the response
body, the log line, and the Sentry tag.

```json
{ "success": false, "message": "Internal Server Error", "errorId": "a3f91b2c" }
```

A customer reads eight characters to support; support searches `errorId:a3f91b2c` in Sentry and
lands on the exact event with its tenant tags and stack. Without it, correlating a report with a
log means guessing from a timestamp and a rough description.

4xx responses do not get an errorId — their shape is unchanged, and the frontend's existing
error handling (which reads `message` and `code`) keeps working untouched.

The frontend surfaces it in the 500-case toast as a short code. Copy stays in the established
light voice — the id is shown, not explained.

### Request logging

`backend/middleware/requestLogMiddleware.js`, mounted globally before the route groups, logging
once on `res.on("finish")` — never on request start, which would double every line and still miss
the status and duration.

Production emits JSON (one object per line, so a shipper can be added later without touching
this code); development emits a readable line:

```
[req] POST /api/points/claim 200 43ms org=68a1f2… user=68b2c9…
```

`/healthz` and `/readyz` are skipped. UptimeRobot at 5-minute intervals plus Render's own probe
would otherwise add several hundred lines a day that say nothing.

Fields: `method`, `path` (the route pattern where available, so `/api/points/:id` does not
explode into thousands of distinct paths), `status`, `durationMs`, `organizationId`, `userId`,
`errorId` when present. Never the request body, never query strings that could carry a token.

---

## 4. Continuous integration

`.github/workflows/ci.yml`, on `push` and `pull_request`.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: .node-version    # currently 20
    cache: npm
- run: npm ci
- run: npm run lint                     # tsc --noEmit
- run: npm test -w backend
- run: npm run verify:color
```

`npm test -w backend` needs no services: `tests/helpers/bootServer.js` forces `MONGODB_URI=""`,
so every suite runs against the in-memory mock on its own port. No Mongo container, no secrets.

`npm run verify:color` is a **new** root script wrapping
`frontend/scripts/verify-tenant-color.ts`. That script guards the two design invariants
(`--primary` never becomes a tenant colour; a green tenant brand steps aside to the ink) and today
has no npm script at all — it runs only when a human remembers it exists. CLAUDE.md instructs
running it after touching `lib/color.ts`; CI is what makes that instruction true.

This is the highest-value item in this spec. `backend/tests/multi-tenant-isolation.js` is the
only automated enforcement of the invariant the whole product rests on, and nothing currently
requires it to pass before code merges.

CI does not add a test framework, does not add coverage gates, and does not deploy.

---

## 5. Dependency and uptime automation

`.github/dependabot.yml`: weekly, npm, three directories (`/`, `/backend`, `/frontend` — npm
workspaces do not give Dependabot a single root manifest to reason about). Non-security updates
grouped into one PR to keep the volume reviewable; security updates raised individually and
immediately. This is what keeps the `xlsx` ban enforced by a bot rather than by memory, and what
surfaces the next such CVE without anyone going looking.

UptimeRobot (free tier) monitors `GET /readyz` every 5 minutes with email alerting. Configuration,
not code — documented in the runbook. It has a second effect worth stating: it keeps Render's free
instance from sleeping, so a customer scanning a QR does not wait out a cold start.

---

## 6. `MAINTENANCE.md`

Repo root. Written for whoever is on call, which for now is one person who will have forgotten
the details.

**Severity ladder**, with this app's examples rather than generic ones:

| | Meaning | Examples here |
|---|---|---|
| S1 | Money or loyalty stops | Claim or redeem returning 5xx; Mongo unreachable; a balance not matching its ledger |
| S2 | A whole tenant or role is blocked | Staff login broken; one outlet's console down; subscription wrongly reading expired |
| S3 | Degraded, work continues | Verification emails not sending; reports failing to export; SMS provider down |
| S4 | Cosmetic | Layout, copy, a chart axis |

**Triage flow**, one path: errorId → Sentry issue → tags name the company, outlet, and role →
Sentry's users-affected is the count, already outlet-scoped (§2) → stack and breadcrumbs give the
cause → `/api/platform/health` confirms whether it is environmental.

**Known failure modes**, each with the symptom, the check, and the fix:

- Mock DB live in production — `usingMockDb: true` in the health detail. Data vanishes on restart
  and `/__test__` routes mount, one of which mints a session token for any email. `server.js`
  already fatals on this at boot; the health field is the second line of defence.
- Render free tier blocking outbound SMTP (ports 25/465/587) — emails silently never arrive.
  `emailProvider: "smtp"` in the health detail is the tell. Fix is `BREVO_API_KEY` (port 443).
- Cold start on the free instance — first request after idle takes tens of seconds. UptimeRobot
  prevents it; the runbook says so, so nobody debugs it as a performance bug.
- Rate-limit false positive — a whole café's staff behind one NAT sharing an IP bucket. Symptom is
  429 on login for a group at once. `authLimiter` thresholds and the shared-bucket behaviour are
  documented so the fix is raising a number, not rewriting the limiter.
- Subscription grace period — expiry is derived from `currentPeriodEnd` at read time with a 5-day
  grace. There is no cron, so "it did not run" is never the explanation.
- Points balance drift — see the audit script below.

**Data health.** A new `npm run audit:invariants` (`backend/scripts/auditInvariants.js`) asserts
that every `PointsBalance.balanceCenti` equals the sum of its `PointsTransaction` rows, and
reports any balance whose `expiresAt` has passed without an `expire` row materialized. The
ledger-equals-balance property is what the entire points design rests on — it is the reason
corrections are append-only rows rather than edits, and the reason centipoints are integers. It
is currently asserted nowhere outside the test suite's fixtures. The script is run manually
against production (read-only, no writes) and is not wired into CI, where it would only ever
re-check seed data.

**Backups.** Atlas M0 has no automated backups. The runbook specifies a `mongodump` cadence and a
restore rehearsal, because an untested backup is not a backup.

**Dependency policy.** The `xlsx` ban and its two CVEs, ExcelJS as the sanctioned alternative
including the reason `node-xlsx` does not qualify (it wraps SheetJS), and how to respond to a
Dependabot security PR.

---

## Testing / verification

1. **`backend/tests/health.js` (new, added to `package.json`'s `test` chain** — a suite not in
   that chain never runs): `GET /healthz` returns 200 with `status: "pass"`; `GET /readyz` returns
   200 with a `checks.mongodb` block against the mock DB; `GET /api/platform/health` returns 401
   without a token, 403 for a `business_admin` token, and 200 with `usingMockDb: true` for a
   platform admin. The 503 path is asserted by injecting a failing probe, not by stopping the mock
   DB — the suite must not depend on tearing down infrastructure it shares.
2. **Sentry disabled-by-default is itself a test assertion.** The health suite asserts
   `sentry.enabled === false` when `SENTRY_DSN` is unset, which is the condition under which the
   whole existing suite runs. If a future change makes Sentry initialize unconditionally, this
   fails rather than quietly sending test errors to a real project.
3. **`scrubPii` is unit-tested** against an event containing an email, a phone, an
   `Authorization` header, and a `claimSecret` in a breadcrumb — asserting all four are gone and
   that `user.id` survives. This is the test that keeps decision 5 true.
4. **Existing suite passes unchanged.** The request logger, the error-id field, and the
   `tagScope` calls all sit on paths every suite exercises; any of them throwing surfaces
   immediately. Confirm no suite asserts on the exact shape of a 500 body (the added `errorId`
   field would break such an assertion).
5. **CI is verified by CI** — the workflow's first green run on a PR is the proof.
6. **Manual, post-deploy:** `curl -i https://<render-host>/readyz` returns 200; confirm Render's
   dashboard health-check path is `/readyz`; throw a deliberate 500 from a scratch route and
   confirm the Sentry issue arrives carrying `companyId`/`organizationId`/`role` tags and the
   matching `errorId`, with no email or phone anywhere in the event.

## Documentation corrections

Both are corrections of statements that are now false, made in this change rather than left to
drift:

1. **`2026-07-19-production-scalability-hardening-design.md`, decision 5** ("Health check: reuse
   the existing `GET /` — no new endpoint") is superseded by §1. Amend the decision in place with
   a pointer to this spec, and update deploy-checklist step 7 (`/` → `/readyz`) and verification
   step 3. `GET /` cannot distinguish a live process from a live process that cannot reach its
   database, so Render would keep routing traffic to a server unable to serve any of it.
2. **CLAUDE.md's "No cron"** is stated in three places (points expiry, subscription expiry,
   platform-wide analytics) and repeated as a codebase-wide property in the hardening spec's
   out-of-scope list. It is no longer true: `server.js:227` schedules `node-cron` daily for
   `messagingService.runDailyTriggers`. The claim remains correct and important for *points and
   subscription expiry* specifically — both are still derived at read time — so the fix is to
   narrow the statements to those subsystems, not to delete them. §1's `cron.dailyTriggers` field
   surfaces the job that does exist.

## Environment variables added

| Variable | Where | Required | Effect when unset |
|---|---|---|---|
| `SENTRY_DSN` | backend | no | Sentry never initializes; no behaviour change |
| `VITE_SENTRY_DSN` | frontend build | no | Same, frontend side |
| `SENTRY_AUTH_TOKEN` | frontend build | no | Source maps not uploaded; build still succeeds |
| `RENDER_GIT_COMMIT` | backend | no | Injected by Render; `releaseId` falls back to `"unknown"` |

No variable added here is fatal-when-missing. That is deliberate: observability must never be the
reason a deploy will not boot.
