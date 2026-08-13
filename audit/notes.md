# Audit working notes

## Secrets (Phase 2 findings)
- FULL git-history scan (all 585 commits, all 2713 blobs, all branches): NO real secrets found.
  - Only mongodb URIs found are the literal marker `mongodb://in-memory-fallback`.
  - No JWT_SECRET, Stripe, SendGrid, GCP, Brevo, VAPID, SMTP passwords, private keys in history.
  - No `.env` file ever tracked in any tree (only `.env.example`, which correctly uses placeholders).
  - Deleted `Cafe-Loyalty-Home-main/` content checked: no API keys.
- Live tree: only `backend/.env.example` with placeholders. `.gitignore` correctly ignores `.env*` except example.
- LOW concern: `backend/server.js` line 11 dev fallback `process.env.JWT_SECRET = "dev_only_insecure_jwt_secret_change_me"` (in-memory dev only; guarded by production fatal). Documented risk but dev-only.
- Verdict: SECRETS IN HISTORY = CLEAN.

## Dependency CVEs (npm audit, prod)
- 6 advisories: 2 high, 4 moderate, 0 critical.
  1. brace-expansion <1.1.18 / 2.x<2.1.4 — HIGH, DoS (unbounded expansion) — transitive via readdir-glob + direct(?) node_modules/brace-expansion. Fix available.
  2. ip-address <=10.3.0 — HIGH, SSRF/trust-boundary bypass via leading-zero octets + CIDR suffix + IPv4-mapped IPv6 — transitive (whose dep? check). Fix available.
  3. exceljs >=3.5.0 — MODERATE via uuid — direct dep (reports xlsx export). Fix requires downgrade to 3.4.0 (major downgrade!) or patch uuid. 
  4. uuid <11.1.1 — MODERATE (buffer bounds v3/v5/v6 with buf) — transitive via exceljs.
  5. react-router 6.0.0-7.17.0 — MODERATE, open redirect via backslash + arbitrary constructor injection in SSR hydration — direct? (react-router-dom direct). Fix: bump to 7.18.0+.
  6. react-router-dom — MODERATE, open redirect leading to XSS (GHSA-jjmj-jmhj-qwj2). Fix: bump.
- Need: which packages pull in ip-address and brace-expansion; check react-router version in use.

## TODO next: auth middleware review

## CVE detail (installed versions)
- brace-expansion 1.1.16 (direct) + 2.1.2 (via readdir-glob → archiver via exceljs): HIGH, fixable to 1.1.18 / 2.1.4 by npm audit fix (overrides).
- ip-address 10.2.0 (hoisted, via exceljs → archiver chain? actually via which lib — check: `npm ls ip-address` empty earlier; root npm audit says node ip-address used by something; likely exceljs/adm-zip/unzipper). HIGH SSRF bypass. Fix available (>=10.3.0? need check latest version; npm audit says fixAvailable true → bump to fixed version via override).
- exceljs 4.4.0 (direct backend): MODERATE via uuid 8.3.2. uuid<11.1.1 moderate. exceljs 4.4.0 is latest? check. uuid is direct dep of backend (11.1.0 in backend/pkg) but exceljs bundles own 8.3.2.
- react-router 6.30.4 / react-router-dom 6.30.4 (frontend): both in vulnerable range (<7.18.0). Open redirect+XSS + constructor injection. Fix: bump to 7.18.0+ (major upgrade; check breaking changes: react-router v7 has data router, client-side compat mostly works but need testing).

## Auth/rate-limit/server architecture findings
- server.js: CORS origin allowlist, helmet (CSP off, fine for JSON API), trust proxy=1 prod, 2MB JSON body limit. /health public. /__test__ ONLY mounted if USING_MOCK_DB (in production real DB → never mounted; double-guarded with NODE_ENV===production fatal on mock DB). WELL DEFENDED.
- testHookRoutes.js lines 54-163: mint-token/get-otp-code/mint-global-token/mint-admin-token (token mint + OTP read primitives) — only reachable on mock DB. If guard holds, mitigated. Keep as "defense in depth" ticket: route module should hard-fail outside test env too (env var gate) — a misconfigured deploy is the attack path.
- tokenUtils.js: JWT 7d default (tenant), global sessions 60d. Different secrets for tenant vs global tokens — good. No refresh token rotation; logout = token stays valid until expiry/revocation. No token revocation list. 60d global session = long-lived token risk (mitigated partly by per-request DB re-fetch → can be "suspended" but not individually revoked).
- authMiddleware.js: strong — per-request DB re-verification incl. org + company suspended status, fresh staffRole from DB. Header extraction accepts x-access-token and custom 'token' header (legacy).
- tenantMiddleware.js: tenant resolution via X-Company-Slug/X-Outlet-Slug headers OR params OR subdomain. Public.
- customerAuthMiddleware.js: global-session verify; only CustomerAccount; no tenant re-scope inside — enter-tenant exchanges for tenant JWT.
- rateLimitMiddleware.js: authLimiter 20/15min, registrationLimiter 10/hr, uploadLimiter 20/hr, placesLimiter 30/5min, pinLimiter 20/min (skip if no pin). In-memory MemoryStore — correct for single Render instance; breaks on horizontal scale (documented).
  - GAPS: /google (OAuth) unthrottled; /verify-email unthrottled (OTP/ link enumeration?); /reset-password POST unthrottled; customerAccountRoutes /forgot-password has limiter but /reset-password doesn't; platform login has authLimiter; admin-auth? (check); /api/claim start status poll? claim routes mostly tenant-JWT gated; public endpoints /health, /, tenant/menu — low value.
  - EXPENSIVE/SENSITIVE unthrottled: report downloads (xlsx via exceljs), /api/admin/* downloads (customer CSV export?), broadcast send, SMS send triggers, /api/reviews, /api/points/*, image uploads 20/hr ok.

## Still to check
- adminAuthRoutes + adminRoutes route gating (is there any admin route WITHOUT verifyToken/resolveTenant?)
- pointsRoutes claim/redeem — server-side IDOR: can user redeem another's points? claim/:pendingClaimId scoped how?
- reports/image upload validation; NoSQL injection ($gt etc.) in query inputs
- XSS sinks frontend; redirect/open-redirect in frontend routes
- logs/error leakage: global error handler returns error.message (could leak internal text? usually benign custom errors)

## Injection / uploads / validation findings
- NoSQL injection: NO direct req.* injection into Mongo query objects found (grep clean). Tenant scoping server-side in queries (organizationId from JWT). GOOD.
- Command injection/exec: none (circuit-breaker `.exec` is fn executor, not shell). GOOD.
- Path traversal: none in user-facing code; res.sendFile uses join with distPath, but note: req.path.startsWith check happens AFTER sendFile? NO — line 190-195: express.static first, then wildcard `app.get("*")` checks req.path.startsWith(/api or /__test__) then sendFile. Actually order: static middleware serves dist files; catch-all sends index.html for everything non-API. Fine.
- eval/new Function: none.
- File uploads: strong. imageBytes.js byte-sniffs PNG/JPEG/WebP only (SVG banned), shared one copy; multer limit MAX_IMAGE_BYTES; type from bytes not Content-Type; nosniff header on image responses. Image model presumably validates too.
- XSS (frontend): no dangerouslySetInnerHTML/innerHTML found. Good.
- Excel formula injection: menuService.xlsx.load reads workbook with cellText coercing all values to strings — reading a formula returns its cached result; no execution server-side. For EXPORT side need to check: if report/customer CSV/XLSX puts user content into formula cells. Need to verify reportService exceljs export writes string values with `cell.value = String(x)` — check reportController downloadCustomers/downloadTransactions + platform downloads. EXCELJS formula-injection mitigation: writing strings starting with '=' could be executed when opened in Excel (CSV/Excel injection, CVE class). Check.
- Menu import: parseMenuWorkbook — cells read as text, string-only; values used as name/price/category/description. parsePrice presumably numeric-only. Should verify parsePrice rejects formulas (=1+1 returns NaN).

## Excel export findings (cont.)
- buildCustomersWorkbook/buildTransactionsWorkbook: user-controlled strings (name, email, phone, address) written raw via sheet.addRow([...]). No cell type pinning, no formula-injection sanitization (values starting with `=`, `+`, `-`, `@` are stored as strings but EXCELJS writes them as-is; Excel/Google Sheets WILL interpret `=CMD(...)` when the workbook opens → Excel formula injection / CSV injection class. ExcelJS >=4.3 does NOT auto-escape by default; mitigation = prefix dangerous chars with single quote (stored as 'string) — CHECKS: none present. Severity: Medium — attacks an admin's local spreadsheet (macro trigger), needs a malicious customer name. Tickets.
- Tenant scoping on exports: buildCustomersWorkbook uses org from JWT → no IDOR on export. pointsService.getCustomerDetailRows scopes User.find by organizationId. GOOD.

## More auth/rate-limit findings
- authRoutes.js (TENANT-SCOPED auth): NO rate limiters at all, NO turnstile on /login, /register, /forgot-password, /resend-verification. Only resolveTenant (public) + verifyToken on /complete-profile. Contrast with customerAccountRoutes/adminAuthRoutes which have authLimiter + verifyTurnstile on the same flows. FINDING: tenant login/register unthrottled, no Turnstile → brute force + email spam possible on the per-outlet login. Also /reset-password (both global and admin) has NO limiter — token-based, but unlimited submissions enable spam/flooding (and token enumeration via timing? tokens are hashed, compare probably constant-ish).
- turnstileMiddleware: fatal-in-prod without secret — good. Dev skips. verifyTurnstile reads req.body.turnstileToken.
- OTP: 5 attempts then lockout with cooldown (customerAccountService, adminAuthService) — good. BUT no IP-level rate limit on verify-otp at all (only authLimiter 20/15min on POST /verify-otp globally — yes, that covers it IP-wise).
- /google endpoints (tenant + global): unthrottled (token-gated per comments). Google verifies audience = GOOGLE_CLIENT_ID, email_verified required. Fine.
- pointsController claim/redeem: tenant from JWT only, org scoped; consumeDynamicQrToken one-time use inside transaction; redeemPoints validates balance etc. No rate limiting on redeem endpoint — attacker with stolen JWT could sweep? redeem costs outlet nothing (item cost borne by outlet config; redeem can't exceed balance). LOW.
- Error leakage: 7 response bodies return error.message — these are all app-authored custom error messages (user-facing), not stack traces. server.js handler: {success:false, message: error.message}. Stack traces not leaked. console.log usage: emails logged with [email:stub] only in stub mode. Render logs are private. INFO-level.
- Logging: message logging includes customer email in failure notices — benign (operational logging), Render console only.

## Payments
- No live payment gateway (README: manually-issued activation keys). subscriptionKeyRoutes + subscriptionService: manual key redemption; no Stripe/Payments → PAYMENTS scope = subscription redemption logic only. Check key redemption for rate limiting/validation (POST /api/company/subscription/redeem-key — is it limited?).

## Payments / subscription findings
- redeemKey (subscriptionKeyService.js:86): atomic claim via findOneAndUpdate {status:"unused"} predicate — no double-spend. Refund on failed activation. Company-scoped (req.companyId from JWT). No rate limiter on POST /api/company/subscription/redeem-key — key codes are ~high-entropy? check key generation (crypto.randomBytes?). If low-entropy → brute force risk. Also unauthenticated users can't reach it (verifyCompanySession blanket).
- No live payment gateway; manual key model.

## enterTenant note
- enterTenant auto-creates membership (ensureMembership) for ANY global-session customer against ANY tenant organizationId → by design (scanned a QR = joined). Tenant entry is open to any logged-in customer — business model, not a bug. Points only accrue via outlet-generated QR tokens. Acceptable, document.

## Misc static findings
- parsePrice: strips non-[0-9.] chars → '=100' → '100' numeric. Safe.
- Subscription key: KEY-{16 hex chars} = ~75 bits entropy. Strong.
- NoSQL injection / command / path traversal / eval: clean. XSS sinks in frontend: clean. Auth middleware/tenant scoping: strong.
- Outstanding: authRoutes unthrottled login/register (HIGH-ish), report exports formula injection (MEDIUM), dependency CVEs (HIGH/MOD), /health leaks info (LOW), frontend uses localStorage for tokens (MEDIUM), no logout/revocation (LOW-MED), in-memory rate-limit store (MED ticket), error.message responses (INFO), /api/health no auth needed (INFO), response compression+body limit 2MB ok.
- Need to check: CORS reflection?, helmet missing HSTS/XFO?, session cookie vs localStorage (frontend), QR token brute force on public claim endpoints (DynamicQRToken entropy).

## Final static findings (pre-compaction backup)
- DynamicQRToken: uuidv4() (pointsService.js:193/238), TTL 30s earn / 180s redeem. UUIDv4 has 122 random bits — fine, but 30s window + public endpoint /api/claim/start accepts token POST (with resolveTenant only). A leaked QR token = stamp awarded to whoever scans first. Rate limit on /api/claim/start? NONE visible. LOW-MED (operational: staff QR displayed physically; attacker would need to see/intercept QR; token 30s TTL).
- Frontend token storage: ALL tokens (admin_auth_token, customer_auth_token, customer_global_session, platform_auth_token) in localStorage — no httpOnly cookies. XSS would steal tokens (mitigated somewhat by no innerHTML/dangerouslySetInnerHTML; still MEDIUM: single-page React app w/o HTML injection sinks). Document as design choice w/ recommendation for httpOnly cookie or at minimum CSP (CSP disabled — helmet contentSecurityPolicy: false; for a SPA a CSP WOULD still protect localStorage via script-src).
- CORS: allowlist-based, not reflect — GOOD.
- Helmet: CSP disabled (noted in server.js comments — JSON API), cross-origin resource policy cross-origin (needed for split hosting). Acceptable; ticket to add CSP report-only or re-evaluate.
- /health returns {status:"ok"} public — no version/stack leak. GOOD.

## LIVE DYNAMIC CHECKS TO DO (Phase 3)
- Live domain unknown (user didn't answer yet). Test non-destructive probes on public endpoints via render preview if possible; check render deploy URL from repo metadata — no deploy URL in repo. Try stampd domains? Ask user.
- Probe: GET /health, CORS with unexpected origin (expect no ACAO reflect), OPTIONS preflight, GET /__test__/mint-token (expect 404), POST /api/claim/start with junk token (expect 400/404), rate-limit probe headers (RateLimit headers present?), enumeration of /api/* root.

## Phase 4: CRITICAL FIXES TO IMPLEMENT (planned)
1. Dependency CVEs: npm audit fix (brace-expansion, ip-address overrides) + bump react-router/dom to >=7.18.0 (needs testing frontend) — MEDIUM-HIGH effort.
2. AuthRoutes rate limiting + Turnstile (authLimiter + verifyTurnstile on register/login/forgot/resend) — LOW effort, HIGH value.
3. /api/customer-auth + /api/admin-auth /reset-password: add registrationLimiter — LOW effort.
4. Excel formula-injection guard in reportService (escape leading =@+ - with single quote) — LOW effort.
5. testHookRoutes defense-in-depth: hard guard `if (process.env.NODE_ENV !== 'test' && !process.env.ALLOW_TEST_HOOKS) throw 503` — LOW.
6. Security headers: enable helmet CSP (script-src self), HSTS? (Cloudflare handles TLS). LOW.
7. Verify: run test suites (npm run test:* backend).
