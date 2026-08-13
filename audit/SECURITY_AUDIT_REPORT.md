# Stampd App — Security Audit Report

**Date:** 13 August 2026
**Scope:** AUTH / PAYMENTS / USER DATA (with injection, secrets, uploads, dependencies, rate limiting, and information leakage as requested)
**Method:** Full static audit (all 585 commits, 2,713 git blobs, every route, middleware, service, and controller) plus dynamic attack validation against the production code running on an isolated mock database (identical code path, zero production data touched). The cloud Strix pentest was not used (account out of scan credits); the same ground was covered with the deep static audit and manual dynamic probing instead.
**Author:** Manus AI

---

## 1. Executive summary

The Stampd codebase is in notably good shape for an app serving live production tenants. The core isolation invariants hold: tenant scoping is derived server-side from JWTs rather than client headers (cross-tenant spoofing was live-proven to be rejected with `403`), JWT signatures cannot be tampered with, no secrets exist anywhere in git history, no injection class (NoSQL, command, path traversal, XSS sinks, eval) was exploitable, image uploads are byte-sniffed rather than trust-the-content-type, and the dangerous `/__test__` hook routes are never mounted in production.

However, the attack surface had **real, live-proven gaps on the authentication boundary**: the tenant-scoped outlet login/register/forgot-password console had **no rate limiting and no Turnstile at all**, and both reset-password endpoints (global customer and unified admin) were **completely unthrottled** despite being token-gated. These were confirmed with direct probes (25 rapid requests, no `429` ever returned) and have now been fixed. Two dependency CVEs rated **High** (DoS via brace-expansion, SSRF/bypass via ip-address used inside express-rate-limit) and three **Moderate** advisories were also remediated, plus Excel formula injection in the admin XLSX exports and a small configuration-name leak in the public reviews endpoint.

All fixes are on the branch `security-audit-fixes` (not merged to `main`). 40 of 43 backend test suites pass on the branch; the 3 failing suites fail identically on a clean `main` checkout and are pre-existing flakiness, not regressions (documented in Section 6).

| Verdict area | Result |
| --- | --- |
| Secrets in code/config/git history | **Clean** — zero real credentials found in history or working tree |
| Injection (NoSQL, XSS, command, path traversal) | **Clean** — no exploitable vectors; Mongoose typing + server-side tenant scoping |
| Auth gaps | **Found & fixed** — tenant console unthrottled (live-proven); reset-password endpoints unthrottled |
| IDOR (user A reading user B) | **Clean** — cross-tenant and cross-user probes all rejected server-side |
| File uploads / input validation | **Strong** — byte-level image sniffing, field whitelisting, size limits |
| Dependency CVEs | **2 High fixed**, moderate exceljs/uuid residual assessed as non-exploitable |
| Rate limiting on expensive endpoints | **Partially missing** — fixed on auth; export/broadcast/SMS endpoints remain unthrottled (tickets) |
| Error/log leakage | **Mostly clean** — one config-name leak fixed; no stack traces anywhere |

---

## 2. What was already solid (verified, not just claimed)

These were confirmed dynamically against the running code, not just by reading it. This matters because "secure-looking code" and "actually secure code" differ — the codebase earned this section.

**Tenant isolation from JWTs, not headers.** An attacker holding a legitimate JWT from `himalayan-bites` outlet while sending `X-Company-Slug: sweet-corner / X-Outlet-Slug: main` headers received `403 Forbidden` on every admin route. The tenant context comes from the signed token (tenant-scoped JWTs use a **different signing secret** from the global customer JWT, and cross-use of a global token on a tenant route returns `401 "invalid signature"`). Header-spoofing cannot reach another tenant's data.

**JWT integrity.** Tampering with the `organizationId` inside a payload produces `401 invalid signature`. Session records are re-fetched from the database on every request (including suspended-company/outlet status), so suspension takes effect immediately without token revocation.

**Claim flow.** Junk `pendingClaimId` + wrong secret correctly returns `401/404` without revealing whether the claim exists, thanks to a **constant-time comparison** on the claim secret. Dynamic QR tokens are UUIDv4 (122 random bits) with 30s/180s TTLs and one-time redemption inside a transaction — unguessable in practice.

**NoSQL injection.** Every Mongo query in the codebase uses Mongoose-typed schema fields; no `req.*` value is ever passed as a query object, and tenant-scoped queries pin `organizationId` from the JWT. Probes sending `{"email": {"$gt": ""}}` and `{"id": {"$regex": ".*"}}` payloads simply failed authentication — the typed schema absorbs them.

**Mass assignment.** A probe posting `{"role": "platform_admin", "emailVerified": true}` to `/api/account/profile` returned `200` but the role and verification state were unchanged — the controller whitelists allowed fields, and the tenant-side `/api/account` profile writes to the *membership* row where a rogue rename is reverted by the next `ensureMembership` sync anyway.

**Uploads and CORS.** Image uploads are byte-sniffed for PNG/JPEG/WebP only (SVG explicitly banned), validated against real byte length, and served with `X-Content-Type-Options: nosniff` so browsers never render user bytes as HTML/script. CORS is an allowlist (no reflection of `Origin`), and `/__test__` hooks — which include token-minting primitives — are only mounted when the in-memory mock DB is active and crash fatally in production (`NODE_ENV === "production"` guard). A 3MB body is correctly rejected with `413` (2MB limit).

**Payments surface.** There is no live payment gateway; billing runs on manually-issued activation keys. Key redemption is atomically claimed with `findOneAndUpdate({status: "unused"})` (no double-spend), scoped to the company from the JWT, with rollback on failed activation, and keys carry ~75 bits of entropy (`crypto.randomBytes`-derived hex). Nothing in the payments flow was exploitable.

**Git history.** Every blob across all 585 commits and all branches was scanned for secret patterns (API keys, MongoDB URIs, JWT secrets, SMTP credentials, turnstile secrets, webhook URLs). The only matches are the literal dev marker `mongodb://in-memory-fallback` and the documented, production-guarded dev fallback `dev_only_insecure_jwt_secret_change_me` in `backend/server.js` line 11 — which the server refuses to start with in production mode. No `.env` file has ever been tracked in any tree; `.env.example` uses only placeholders.

---

## 3. Confirmed findings and fixes applied

Severity follows CVSS-style triage: **Critical** (remote, no auth, immediate data loss), **High** (auth-bypass or brute-force-class with live proof), **Medium** (conditional exploitation or defense-in-depth), **Low** (defense-in-depth / hygiene).

### HIGH — Fixed in this audit

**H1. Tenant-scoped outlet auth console had zero rate limiting and zero bot protection.**
`backend/routes/authRoutes.js` lines 13–18 (pre-fix). The per-outlet `/api/auth/login`, `/register`, `/forgot-password`, `/resend-verification`, and `/google` endpoints carried only `resolveTenant` — no limiter, no Turnstile — while the *global* and *admin* consoles had both. Live proof: 25 rapid login attempts all returned `400`, never `429`. An attacker could brute-force staff passwords outlet-by-outlet and spray verification emails at will. **Fixed:** every endpoint on the route now carries `authLimiter` (20 req/15 min) or `registrationLimiter` (10 req/hour), and `verifyTurnstile` on login/register/forgot (Google sign-in is provider-gated, rate-limited only). The tenant endpoints share the same limiter instances as the global console, so the per-IP caps are consistent across the app.

**H2. Reset-password endpoints (global and unified admin) were unthrottled.**
`backend/routes/customerAccountRoutes.js` line 28 (pre-fix) and `backend/routes/adminAuthRoutes.js` line 20 (pre-fix). Live proof: 25 rapid reset submissions returned `400`/`401`, never `429`. Tokens are hashed before comparison and there is no timing oracle, but unbounded submissions enable token-guessing at machine speed and email/SMS flooding. **Fixed:** both now carry `registrationLimiter` (10 req/hour).

**H3. Dependency CVEs — 2 High, 3 Moderate.**
`package.json` (root and frontend workspaces). `npm audit` returned two Highs: **brace-expansion < 1.1.18** (unbounded expansion DoS, transitive via `readdir-glob`/`minimatch`) and **ip-address ≤ 10.3.0** (SSRF/trust-boundary bypass — a bypass of the very *rate limiter's* IP parsing via leading-zero octets, meaning rate limits could be evaded). Both are now forced to fixed versions via `overrides` (`brace-expansion ^1.1.18`, `ip-address ^10.4.0`, nested under `minimatch@<=3.1.5` to avoid breaking the `glob@11` chain). Three Moderate react-router advisories (open-redirect via backslash `GHSA-337j-9hxr-rhxg`, hydration constructor injection `GHSA-6cg3-f3mj-j9r7`, open-redirect-to-XSS `GHSA-jjmj-jmhj-qwj2`) were fixed by upgrading `react-router-dom` from `6.30.4` to `7.18.2` — the app only uses `BrowserRouter`/`Routes`/`Route`/`Link`/`useNavigate`, which are API-compatible, and the frontend builds and all frontend-touching suites pass. `postcss`, `nanoid`, and `fast-uri` transitive CVEs were overridden to fixed versions. Residual: **exceljs 4.4.0 → uuid 8.3.2** (Moderate) — the CVE affects uuid's v3/v5/v6 code paths with raw buffers; exceljs consumes only `uuid.v4()`, so this is assessed **not practically exploitable** in this codebase, and the exceljs line has no release with the patched uuid yet.

### MEDIUM — Fixed in this audit

**M1. Excel formula injection in admin report exports.**
`backend/services/reportService.js`, workbook builders `buildCustomersWorkbook` (~line 284), `buildTransactionsWorkbook` (~line 313), and `getRedeemStats` (~line 349). Customer names, emails, phones, addresses, and reward names flow from DB rows that **any staff member at an outlet can author** into XLSX cells unescaped. A malicious "customer" named `=CMD|'/C powershell'!A0` would execute commands when an admin opens the export in Excel. **Fixed:** an `escapeFormula` guard prefixes dangerous leading characters with a single quote (forcing plain-text rendering) at every boundary where stored user content enters a workbook. One regression was caught by the test suite during verification — the first regex also mangled legitimate Nepali phone numbers starting with `+977…` — and was narrowed so `+` is only escaped when followed by a letter, parenthesis, or whitespace.

**M2. Configuration-name leak on the public reviews endpoint.**
`backend/controllers/reviewsController.js` line 17 (pre-fix). With no `GOOGLE_PLACES_API_KEY` configured, the unauthenticated reviews endpoint returned `{"source":"no_api_key","message":"GOOGLE_PLACES_API_KEY is missing"}`, disclosing an internal environment-variable name. **Fixed:** the client now receives the generic `Google reviews are currently unavailable.` while the original detail remains only in the server log.

**M3. Enter-tenant org validation (defense in depth).**
`backend/services/customerAccountService.js`, `enterTenant` at lines 658–668. The controller passes the *header-resolved* organization (never the request body's) into `enterTenant`, and `tenantMiddleware` already 404s unknown companies and blocks suspended companies/outlets — so this could never have issued a JWT for a junk tenant. It was nevertheless missing an explicit guard, so a junk `organizationId` in the body was simply ignored and a JWT for the resolved outlet was issued (confirmed live). **Fixed:** `enterTenant` now verifies the organization exists and is `active` before creating a membership, closing the theoretical drift path where middleware and service semantics diverge.

### Findings investigated and confirmed NOT exploitable

The `/api/customer-auth/enter-tenant` behavior deserves explicit note because the live probe *looked* like a bug: the tenant is always resolved from the `X-Company-Slug`/`X-Outlet-Slug` headers (controller `customerAccountController.js` lines 188–198 reads only `req.organizationId`), which is the QR auto-provisioning design — any logged-in customer may join any active outlet by scanning its QR. Points only accrue through outlet-issued QR tokens, so open entry cannot mint rewards. Documented in code comments and covered by the M3 guard.

---

## 4. Severity-ranked findings table

| # | Severity | Finding | Exact location | Status |
| --- | --- | --- | --- | --- |
| H1 | High | Tenant auth console unthrottled, no Turnstile | `backend/routes/authRoutes.js:13–18` | **Fixed** — limiter + Turnstile on all endpoints |
| H2 | High | Reset-password unthrottled (global + admin) | `customerAccountRoutes.js:28`, `adminAuthRoutes.js:20` | **Fixed** — `registrationLimiter` on both |
| H3 | High/Moderate | Dependency CVEs (brace-expansion, ip-address, react-router×3, fast-uri, nanoid, postcss) | `package.json` workspaces | **Fixed** — overrides + react-router-dom `7.18.2`; exceljs/uuid residual assessed non-exploitable |
| M1 | Medium | Excel formula injection in report exports | `services/reportService.js:252–260`, applied at `:284–349` | **Fixed** — `escapeFormula` guard (verified by tests) |
| M2 | Medium | Env-var name leak on public reviews endpoint | `controllers/reviewsController.js:17` | **Fixed** — generic message to client |
| M3 | Medium | Enter-tenant missing org-active guard (defense in depth) | `services/customerAccountService.js:658–668` | **Fixed** — 404 on unknown/inactive org |
| — | Clean | Secrets in git history / working tree | all 585 commits, all blobs | No finding |
| — | Clean | NoSQL / command / path traversal / eval / XSS sinks | all routes, services, frontend | No finding |
| — | Clean | IDOR: cross-tenant, cross-user, export scoping | verified live with spoofed sessions | No finding |
| — | Clean | File upload validation, CORS, test-hook mount, JWT signing | verified live | No finding |
| — | Clean | Payments: key double-spend, scope, entropy | `services/subscriptionKeyService.js:86` | No finding |

---

## 5. Remaining tickets (not fixed — for your backlog)

Effort is estimated in story points (S ≈ half a day, M ≈ 1–2 days, L ≈ < half a day), assuming a developer familiar with the codebase.

| Ticket | Severity | Description | Effort |
| --- | --- | --- | --- |
| T1 | Medium | **Rate-limit expensive endpoints**: XLSX report downloads, broadcast/SMS sends, and `/api/points/*` have no per-IP caps today. Add `uploadLimiter`-style caps per route. | S |
| T2 | Medium | **Token lifetime and revocation**: global customer sessions live 60 days (tenant JWTs 30d, `backend/utils/tokenUtils.js`), with no refresh rotation or per-token revocation. Add short-lived access + refresh token rotation, or a revocation list keyed by `customerAccountId` version bump. | M |
| T3 | Medium | **Content Security Policy**: helmet's CSP is intentionally disabled; the app stores all tokens in `localStorage`, so any future XSS primitive steals session tokens. Add at minimum `script-src 'self'` CSP (report-only first, then enforcing). | S |
| T4 | Low | **Hard gate on test hooks**: `/__test__` is mounted solely on the mock-DB flag; add a second explicit `ALLOW_TEST_HOOKS` env gate so a misconfigured deploy can never expose token-minting primitives. | S |
| T5 | Low | **Security headers**: enable HSTS (`Cloudflare` terminates TLS, so this is belt-and-braces) and consider `Cross-Origin-Embedder-Policy` fine-tuning. | S |
| T6 | Low | **CI secret scanning**: add `gitleaks`/TruffleHog to a GitHub Action plus required-PR review so history-clean stays clean. | S |
| T7 | Low | **Cloudflare WAF review**: confirm rate-limit rules on `/api/auth/*`, `/api/customer-auth/*`, and `/api/claim/start` at the edge (defense against distributed IP rotation that defeats in-memory limiters). | S |
| T8 | Low | **Scale note on rate-limit store**: limiters use an in-memory `MemoryStore`, which fragments across multiple Render instances; accept (sticky sessions) or swap to Redis/Cloudflare edge. | S |
| T9 | Low | **Pre-existing test flakes**: `platform-contact`, `push-notifications`, `impact` fail identically on clean `main` — not caused by this audit; likely seeded-demo-state assumptions. | S |
| T10 | Low | **Membership enumeration**: `/api/customer-auth/my-tenants` lists a customer's memberships; consider whether listing orgs is intended public behavior or should be rate-limited. | L |

---

## 6. Verification summary

Every fix was proven against the same code path the production app runs, with the full backend test suite as the regression gate. **40 of 43 test suites pass on the branch**; the 3 failing (`platform-contact`, `push-notifications`, `impact`) fail **identically on a clean `main` checkout** and are pre-existing flakiness unrelated to this audit — they are ticket T9, not regressions. Notably, the business-reports suite initially failed *because of* the M1 escape guard (it mangled legitimate `+977…` phone numbers); that regression was caught by the tests, fixed with the narrowed regex, and the suite now passes — a demonstration that the existing test suite works as a safety net.

Dynamic confirmations on the fixed local instance: tenant login now returns `429` after 20 attempts in 15 minutes (was never throttled); global customer registration and reset-password return `429` after 10 attempts per hour (was never throttled); the suspended-outlet and junk-org paths through `tenantMiddleware` and `enterTenant` reject without issuing tokens; and `npm audit` no longer reports any High advisories.

## 7. Deployment recommendation

The fixes are on branch `security-audit-fixes` and **have not been pushed to production**. Recommended order: review the diff, run the CI suites on the branch, then merge. Because two fixes (rate limiting, Turnstile) change request-level behavior, existing rate-limit headers are additive and safe — no client change is required. The react-router-dom major bump changed no used APIs but please smoke-test the login and QR-claim flows after deploy. The dependency overrides and `package-lock.json` changes should deploy normally via your existing Cloudflare/Render pipeline.

---

*Supporting evidence: `audit/notes.md` (full static findings with line references), `audit/dynamic_results.md` (raw dynamic probe results), attack scripts in the audit workspace.*
