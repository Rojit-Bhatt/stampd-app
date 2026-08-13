# Security Roadmap Implementation Plan (T1, T2, T3, T6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four approved security roadmap tickets on Stampd: CI secret scanning (T6), rate limiting on expensive endpoints with a tenant SMS quota (T1), a strict hash-based Content Security Policy in report-only mode (T3), and session versioning with reduced token lifetimes (T2).

**Architecture:** The backend is an Express/Mongoose API served on Render; in production (`NODE_ENV=production`) Express also serves the built frontend from `frontend/dist` with an SPA catch-all that sends `index.html`. Rate limiting uses `express-rate-limit` with the in-memory `MemoryStore` and per-IP keys (correct for the single-instance deployment). JWTs are issued by `backend/utils/tokenUtils.js` (three generators: `generateAuthToken`, `generateGlobalSessionToken`, `generateCompanySessionToken`) and verified by `jwt.verify` with no revocation state. The strict CSP will be a hash-based policy (the Vite build is static, so nonces cannot be issued per response) attached to the `index.html` response by Express, deployed report-only first with a `/api/csp-report` ingestion endpoint.

**Tech Stack:** Node.js 22, Express, Mongoose, express-rate-limit, helmet, vitest-compatible test suites in `backend/tests` (self-booting via `tests/helpers/bootServer.js`), GitHub Actions (new), gitleaks, TruffleHog.

## Global Constraints

- All new rate limiters reuse the existing `jsonHandler(message)` + `standardHeaders: true` conventions from `backend/middleware/rateLimitMiddleware.js`; each limiter group gets its own bucket, never shared.
- Token lifetimes: global sessions `GLOBAL_SESSION_EXPIRES_IN` default changes from `"60d"` to `"30d"`; tenant auth `JWT_EXPIRES_IN` stays `"7d"`. Both remain env-overridable.
- `sessionVersion` is a `Number` with `default: 0` on both `CustomerAccount` and `AdminAccount`, following the `avatarVersion` convention. Verification treats missing payload/row values as `0`: `(payloadValue ?? 0) === (rowValue ?? 0)`.
- The CSP is deployed **report-only** (`Content-Security-Policy-Report-Only`) with violations ingested at `/api/csp-report`; enforcement is a separate future step, not part of this plan.
- The CSP header is only attached to the `index.html` SPA document response in production static serving; API JSON routes keep `contentSecurityPolicy: false` (JSON has nothing to govern).
- `.gitleaks.toml` allowlist is narrow: exactly the dev JWT fallback line in `backend/server.js` and the placeholder values in `.env.example`. Nothing else.
- No client-side (frontend) changes except none — all changes are server-side additive; token payloads gain a `sessionVersion` claim which old clients simply ignore, and the server's per-request session re-fetch already reads the account row every request.
- Every task must pass `node tests/*.js` for all suites that passed on the base branch before the branch is pushed. Pre-existing flakes (`platform-contact`, `push-notifications`, `impact`) fail on the base branch too and are excluded from the pass bar.
- Work on branch `security-roadmap` created from `security-audit-fixes` (which already contains the audit fixes); never touch `main`.

---

### Task 1: CI secret scanning (T6)

**Files:**
- Create: `.gitleaks.toml`
- Create: `.github/workflows/secret-scan-pr.yml`
- Create: `.github/workflows/secret-scan-history.yml`
- Test: run both workflows locally where possible; repo has no prior GitHub Actions, so this is additive.

**Interfaces:** None (no code consumed/produced by other tasks).

- [ ] **Step 1: Write the gitleaks config**

```toml
title = "Stampd gitleaks configuration"

[allowlist]
  description = "Intentional development markers — production-guarded, never secrets"
  paths = [
    '''backend/server\.js''',          # dev JWT fallback constant (production refuses to start with it)
    '''\.env\.example'''                # placeholder values only
  ]
```

- [ ] **Step 2: Write the PR-gate workflow**

`.github/workflows/secret-scan-pr.yml` — triggers on `pull_request` and `push` to `main`/`security-audit-fixes`; runs `gitleaks/gitleaks-action@v2` with `fail-build: true`; posts the SARIF/findings summary.

- [ ] **Step 3: Write the weekly history-sweep workflow**

`.github/workflows/secret-scan-history.yml` — `schedule: cron` weekly; checks out full history (`fetch-depth: 0`); runs `trufflesecurity/trufflehog@main` over the entire repo and every branch; fails the run if any credential is found.

- [ ] **Step 4: Verify gitleaks locally**

```bash
gh release download --repo gitleaks/gitleaks --pattern '*linux-amd64.tar.gz'
./gitleaks detect --source . --config .gitleaks.toml --verbose
```

Expected: clean scan (zero findings; the two allowlisted markers must not appear in findings).

- [ ] **Step 5: Commit**

```bash
git add .gitleaks.toml .github/workflows/secret-scan-pr.yml .github/workflows/secret-scan-history.yml
git commit -m "ci: add gitleaks PR gate and weekly TruffleHog history sweep (T6)"
```

---

### Task 2: Rate limiters for expensive endpoints (T1)

**Files:**
- Modify: `backend/middleware/rateLimitMiddleware.js` — add `exportLimiter` (10 req/15 min), `broadcastLimiter` (5 req/15 min), `platformExportLimiter` (10 req/15 min) in the existing style.
- Modify: `backend/routes/adminRoutes.js` — attach `exportLimiter` to `/menu/template` and the four `/reports/*/download` routes (lines 77, 86–89); attach `broadcastLimiter` to `POST /broadcasts` (line 120).
- Modify: `backend/routes/platformRoutes.js` — attach `platformExportLimiter` to the two report-download routes (lines 17–18).
- Test: create `backend/tests/rate-limit-expensive.js` (new self-booting suite).

**Interfaces:** Consumes the limiter constructors already defined in `rateLimitMiddleware.js` (`rateLimit({windowMs, limit, standardHeaders: true, legacyHeaders: false, handler: jsonHandler(...)})`).

- [ ] **Step 1: Add the three limiters**

```javascript
const FIFTEEN_MINUTES = 15 * MINUTE;
// Bulk data exports. Legitimately rare — no staff re-runs a full-customer
// export more than a handful of times a quarter-hour — while each request
// builds an ExcelJS workbook over the whole tenant dataset. Own bucket:
// sharing with authLimiter would let a password typo burn the export budget.
const exportLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many downloads. Please wait a few minutes."),
});
// Broadcast creation triggers real SMS sends (Sparrow API, paisa per message).
// Tighter cap than exports because this endpoint spends money.
const broadcastLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many broadcasts. Please wait a few minutes."),
});
// Same shape as exportLimiter but its own bucket — platform admin work must
// never burn the tenant admin's export budget or vice versa.
const platformExportLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many downloads. Please wait a few minutes."),
});
```

Append to the existing exports of the module.

- [ ] **Step 2: Attach limiters in adminRoutes**

Import the three limiters, then `router.get("/menu/template", verifyToken, isBusinessAdmin, exportLimiter, downloadMenuTemplate)` and the same `exportLimiter` on the four download routes; `router.post("/broadcasts", verifyToken, isBusinessAdmin, canMarketing, broadcastLimiter, broadcastController.create)`. Keep the existing middleware order (auth/permission first, limiter after — a blocked anonymous request never pays for a limiter lookup; limiter before the controller so the heavy workbook/broadcast work is skipped on 429).

- [ ] **Step 3: Attach platformExportLimiter in platformRoutes** on the two download routes (same ordering).

- [ ] **Step 4: Write the failing test**

`backend/tests/rate-limit-expensive.js` — boots its own server, seeds a tenant admin via the existing `/api/auth` flow, exercises `GET /api/admin/reports/customers/download` 12 times in a loop and asserts the 12th returns `429` with `{success: false}`, then the same for `POST /api/admin/broadcasts` (6th returns 429), and verifies a *different* seeded admin on a different company (sibling outlet via `makeSiblingOutlet`) is NOT throttled (separate per-IP? no — same IP in test → limiter keys on IP, so instead verify the 429 body shape and that the *broadcast* limiter and *export* limiter are independent buckets by hitting the broadcast route 5 times and confirming exports still return 200 from the same IP). Follow the style of `backend/tests/broadcasts.js` (bootServer + makeSiblingOutlet + `api` helper, unique emails with `Date.now()`).

- [ ] **Step 5: Run test, confirm red → implement → green**

```bash
node tests/rate-limit-expensive.js
```

- [ ] **Step 6: Run full suite (expected green, no regressions)**

```bash
for t in tests/*.js; do node "$t" >/tmp/t.log 2>&1 || echo "FAIL: $t"; done
```

- [ ] **Step 7: Commit**

```bash
git commit -am "feat: rate-limit expensive export and broadcast endpoints (T1)"
```

---

### Task 3: Tenant daily SMS quota (T1 continued — money control)

**Files:**
- Modify: `backend/services/smsService.js` — add `checkDailySmsQuota(companyId, organizationId)` called by `sendSms` before `sendViaSparrowApi`.
- Create: `backend/tests/sms-daily-quota.js`.

**Interfaces:** Consumes `SmsSendLog` (existing model) and `createHttpError`. Produces the same `sendSms({companyId, organizationId, to, text})` signature; quota breach throws `createHttpError(429, ...)` with the standard `{success: false, message}` shape.

- [ ] **Step 1: Implement the quota check**

```javascript
// One tenant may send at most this many SMS per rolling UTC day.
// Broadcast abuse is a real money-loss vector (Sparrow charges per message
// and SmsSendLog records SMS_COST_PAISA_PER_MESSAGE per send), so the cap
// applies to every send path — broadcasts and everything else that calls
// sendSms — not just the broadcast endpoint.
const DAILY_SMS_QUOTA = Number(process.env.DAILY_SMS_QUOTA || 1000);
const checkDailySmsQuota = async ({ companyId, organizationId }) => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const count = await SmsSendLog.countDocuments({
    companyId,
    organizationId,
    createdAt: { $gte: start }
  });
  if (count >= DAILY_SMS_QUOTA) {
    throw createHttpError(429, "Daily SMS limit reached. Try again tomorrow.");
  }
};
```

Insert before the `sendViaSparrowApi` call inside `sendSms` (after the to/consent validation that already exists there).

- [ ] **Step 2: Write the failing test**

`backend/tests/sms-daily-quota.js` — seeds the environment, stubs `sendViaSparrowApi` is not needed (use a tiny local override: set `SMS_COST_PAISA_PER_MESSAGE` env and a low `DAILY_SMS_QUOTA=3` in the spawned process env), sends 3 messages, asserts the 4th `sendSms` call throws 429, and asserts a *different* `organizationId` under the same `companyId` keeps its own independent counter (sends succeed).

- [ ] **Step 3: Red → green → run full suite**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: tenant daily SMS quota on every send path (T1)"
```

---

### Task 4: Session versioning and reduced token lifetimes (T2)

**Files:**
- Modify: `backend/models/CustomerAccount.js` — add `sessionVersion: { type: Number, default: 0 }` (after `avatarVersion`, same comment style).
- Modify: `backend/models/AdminAccount.js` — same field.
- Modify: `backend/utils/tokenUtils.js` — all three `generate*` functions include `sessionVersion` in the signed payload (read from the account row passed in; add an optional `sessionVersion` param defaulting to `0` for backward compatibility), and all three `verify*` functions additionally accept the row and reject (`createHttpError`-style `Error`) when `(decoded.sessionVersion ?? 0) !== (row.sessionVersion ?? 0)`.
- Modify: `backend/middleware/authMiddleware.js` — `verifyToken` already re-fetches the account row on every request; pass the row into `verifyAuthToken` after verification.
- Modify: the global-session verifier middleware (`verifyGlobalSession` used by `customerAccountRoutes` line 44 and company/enter-outlet path) — pass the row into `verifyGlobalSessionToken`/`verifyCompanySessionToken`.
- Modify: `backend/services/customerAccountService.js` `changePassword` (controller line 163 path) — bump `sessionVersion` (`$inc: {sessionVersion: 1}`) after a successful password change.
- Modify: `backend/services/adminAuthService.js` (or wherever admin password reset executes) — bump `sessionVersion` on the `AdminAccount` after a successful reset.
- Test: create `backend/tests/session-versioning.js`.

**Interfaces:** `generateAuthToken(payload, {sessionVersion})` keeps the exact same return shape (a signed JWT string) but now signs `{...payload, sessionVersion}`. Verify functions gain signature `verifyAuthToken(token, row)` where `row` is the mongoose document (or null to skip the revocation check — used by the migration-free dev path). Middleware changes are internal; route handlers unchanged.

- [ ] **Step 1: Add schema fields** (both models).

- [ ] **Step 2: Update tokenUtils**

```javascript
const generateAuthToken = (payload, { sessionVersion = 0 } = {}) => {
  return jwt.sign({ ...payload, sessionVersion }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
};
// Throws if the token is signed correctly but the account has since been
// revoked (password change, forced logout, admin deactivation). `row` is
// the live mongoose document re-fetched by the middleware; null skips the
// check, which is exactly what the mock-DB test paths that never re-fetch
// need. Missing `sessionVersion` on either side is treated as 0 so tokens
// minted before this change keep working until naturally expired.
const verifyAuthToken = (token, row) => {
  const decoded = jwt.verify(token, getJwtSecret());
  if (row && (decoded.sessionVersion ?? 0) !== (row.sessionVersion ?? 0)) {
    const err = new Error("Session expired");
    err.statusCode = 401;
    throw err;
  }
  return decoded;
};
```

Apply the same pattern to `verifyGlobalSessionToken(token, row)` and `verifyCompanySessionToken(token, row)`, and add `sessionVersion` to `generateGlobalSessionToken`/`generateCompanySessionToken` payloads.

- [ ] **Step 3: Wire the rows in middleware.** In `authMiddleware.verifyToken`, after the existing re-fetch of the user row, call `verifyAuthToken(token, row)` instead of the bare verify (token string is already on `req` — pass the same header value). Do the equivalent in the global-session verifier used by `customerAccountRoutes`/`companyRoutes`.

- [ ] **Step 4: Bump on revocation events.** `customerAccountService.changePassword`: after hashing and saving the new password, run `CustomerAccount.findByIdAndUpdate(id, { $inc: { sessionVersion: 1 } })`. Same inc in the admin password-reset service after a successful reset. Existing tests that change passwords will keep passing because each test boots a fresh mock DB and minted tokens already carry the row's current version — the test's own token stays valid; only *previously issued* tokens die, which is the intended behavior.

- [ ] **Step 5: Write the failing test**

`backend/tests/session-versioning.js` — registers and logs in to obtain a token, changes the password via the API, then asserts the ORIGINAL token is rejected 401 while a fresh login works; and directly asserts that a token minted with `sessionVersion: 0` against a row at `sessionVersion: 1` throws "Session expired".

- [ ] **Step 6: Red → green; change the default lifetime** in `tokenUtils.js`: `GLOBAL_SESSION_EXPIRES_IN || "30d"` (was `"60d"`). Full suite green.

- [ ] **Step 7: Commit**

```bash
git commit -am "feat: session versioning for instant revocation + 30d global session (T2)"
```

---

### Task 5: Strict hash-based CSP, report-only (T3)

**Files:**
- Create: `backend/middleware/cspMiddleware.js`
- Modify: `backend/server.js` — compute the bootstrap script hash at boot, register the CSP middleware on the SPA document route, add `/api/csp-report` ingestion route.
- Create: `backend/tests/csp-report-only.js`.
- Modify: `frontend/index.html` — only if needed to reduce inline scripts (verify what inline scripts exist in the built file first; the Vite build's modulepreload script is the hash target).

**Interfaces:** `cspMiddleware` is an Express middleware that sets `Content-Security-Policy-Report-Only` on the `index.html` response only (skip API paths and static assets other than the document). Consumes `crypto`, `fs` at boot to hash `index.html` inline scripts. Produces violation reports accepted at `POST /api/csp-report` (CSP `report-uri`), stored in `PlatformAuditLog`-style logging: `console.log` the violation at a structured level — YAGNI forbids a new DB table; a structured log line is enough for observation.

- [ ] **Step 1: Determine the hash target.** Build the frontend (`cd frontend && npx vite build`), read `frontend/dist/index.html`, and list inline `<script>` contents. Compute `sha256-` base64 digests of each inline script body per the CSP spec (hash over the raw script text including internal whitespace normalization caveat — CSP hashes use the *exact* script text as served). In production the same file is served, so the boot-time computation in `server.js` is byte-identical to the build output.

- [ ] **Step 2: Write the middleware**

```javascript
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Strict (hash-based) CSP for the SPA document. The Vite build is static, so
// a per-response nonce is impossible — instead every inline bootstrap script
// in index.html is hashed at boot and allowlisted. strict-dynamic trusts
// scripts those blessed scripts load (the whole app bundle chain), and
// object-src/base-uri none close the classic gadget classes.
//
// Deployed report-only: nothing breaks, violations flow to /api/csp-report.
// Enforcement is a deliberate follow-up step after a clean observation window.
const buildCspHeader = (hashes) => {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' ${hashes.map((h) => `'sha256-${h}'`).join(" ")} 'strict-dynamic' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `connect-src 'self'`,
    `font-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`
  ];
  return directives.join("; ");
};

const cspMiddleware = (distPath) => {
  let header = null;
  try {
    const html = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
    const hashes = (html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi) || [])
      .map((tag) => tag.replace(/<\/?script[^>]*>/gi, ""))
      .filter((body) => body.trim().length > 0)
      .map((body) => crypto.createHash("sha256").update(body).digest("base64"));
    header = buildCspHeader(hashes);
  } catch (err) {
    // Dist not built (dev): no document served here anyway; middleware no-ops.
    header = null;
  }
  return (req, res, next) => {
    if (header && req.path.endsWith("/index.html") === false && req.accepts(["html"])) {
      // Set on document requests only (SPA catch-all and explicit index.html).
      if (req.path === "/" || req.path === "/index.html" || !req.path.startsWith("/api")) {
        res.setHeader("Content-Security-Policy-Report-Only", header);
      }
    }
    next();
  };
};

module.exports = { cspMiddleware };
```

Refine the document-detection condition during implementation: the middleware should set the header on responses that are HTML documents (the SPA catch-all and the `/` route), checked via `req.accepts("html")` and non-API path — verify dynamically that it sets on document requests and does NOT set on `/api/*` JSON routes.

- [ ] **Step 3: Wire server.js.** In the `NODE_ENV === "production"` static-serving block, `app.use(cspMiddleware(distPath))` before the catch-all; add `app.post("/api/csp-report", express.json({ type: "application/csp-report" }), (req, res) => { const r = req.body?.["csp-report"]; console.log(JSON.stringify({ type: "csp-violation", blockedUri: r?.blockedUri, documentUri: r?.documentUri, violatedDirective: r?.["violated-directive"], effectiveDirective: r?.["effective-directive"], originalPolicy: r?.["original-policy"], timestamp: new Date().toISOString() })); res.sendStatus(204); })`. Update the existing helmet comment block to document why CSP stays off for JSON routes and is document-only.

- [ ] **Step 4: Write the failing test**

`backend/tests/csp-report-only.js` — boots the server with `NODE_ENV=production` and a real built `frontend/dist/index.html` (build first as a test prerequisite step), fetches `/` and asserts the `Content-Security-Policy-Report-Only` header is present and contains `strict-dynamic`, `object-src 'none'`, and at least one `sha256-` hash; fetches `/api/health`-equivalent and asserts the header is absent; posts a synthetic CSP report to `/api/csp-report` and asserts `204` with the violation logged (capture console output).

- [ ] **Step 5: Red → green; full suite green**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: strict hash-based CSP in report-only mode on the SPA document (T3)"
```

---

### Task 6: Final verification, push

**Files:** none new.

- [ ] **Step 1: Full backend suite** — every `tests/*.js`, expect all suites that pass on the base branch to still pass; the three pre-existing flakes are excluded.
- [ ] **Step 2: Frontend build** — `cd frontend && npx vite build` green.
- [ ] **Step 3: gitleaks local scan** — clean.
- [ ] **Step 4: Push** `security-roadmap` to origin (branch only; no merge to main, no PR unless asked).
