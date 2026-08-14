# Dynamic Validation Results (local mock-DB instance, same code as prod)

All probes executed against `http://127.0.0.1:5001` booted from the repo's own code (NODE_ENV=development, in-memory mock DB; seed data: 3 companies × outlets, 3 global customers). Scripts: /home/ubuntu/attack/dynamic_test.sh, idor_test.sh, attack2.py, attack3.py (phase3b).

## Confirmed WORKING defenses (validated live)
1. `/__test__` hooks: 404 in prod mode (verified in code: only mounted when USING_MOCK_DB + NODE_ENV guard). In dev/mock they require tenant context; token-mint helpers exist but are scoped to test builds.
2. CORS: no reflection — evil/null origins get NO `Access-Control-Allow-Origin` header (only credentials header echoed). Verified via curl.
3. Rate limiting works: global login hits 429 after 20/15min with `RateLimit-*` headers + `Retry-After`. Tenant `/api/auth/*` routes: NO limiter at all — 25 rapid logins all returned 400, never 429. CONFIRMED FINDING.
4. `/reset-password` (both global and admin-auth): 25 rapid submissions all 400, never 429. CONFIRMED unthrottled.
5. `/api/customer-auth/google`: junk tokens all 500, never rate-limited. CONFIRMED unthrottled.
6. JWT tampering (organizationId changed in payload): 401 "invalid signature" — signature verification works.
7. Cross-tenant admin IDOR with spoofed X-Company-Slug/X-Outlet-Slug + legitimate JWT from another org: 403 Forbidden — tenant scoping comes from JWT, not headers. CONFIRMED SAFE.
8. Customer→staff role escalation: 401. Admin→company routes: 401. Role checks enforced.
9. Claim flow: junk id+secret → 401/404 (no existence leak on secret mismatch via constant-time compare), status probe with junk id → 404 "Claim not found".
10. Public endpoint scoping: tenant/menu require both slugs (400 otherwise), images 404 for missing rows, .env → 404, path traversal `/api/images/../../etc/passwd` → 404.
11. 3MB body → 413 (2MB limit enforced).
12. Mass-assignment probe on `/api/account/profile` with `{"role":"platform_admin","emailVerified":true}`: HTTP 200 but returned role stayed "customer" and emailVerified false — whitelist of allowed fields; mass assignment NOT exploitable (confirmed safe).
13. enter-tenant with junk organizationId: returned 200 with a tenant JWT for org id "0000..." — membership created for nonexistent org? NEEDS CHECK (returned success + token; downstream queries would 404 on org load — low risk, cosmetic).
14. Global customer token (global_customer type) used against tenant JWT routes (/api/points/*): 401 "invalid signature" — different signing secrets, no cross-use.

## Confirmed gaps (to fix/report)
- **A (Medium-High):** `/api/auth/*` (tenant-scoped auth): zero rate limiting, zero Turnstile on login/register/forgot/resend. Live-proven: 25 reqs without 429.
- **B (Medium):** `/api/customer-auth/reset-password` and `/api/admin-auth/reset-password`: no rate limit (token-based but enables token-flooding/spam). Live-proven.
- **C (Low-Medium):** `/api/customer-auth/google`: no rate limit (Google-verified, but unbounded 500s; minor DoS on oauth client).
- **D (Info):** Public `/api/reviews` without GOOGLE_PLACES_API_KEY leaks env-var name: `{"source":"no_api_key","message":"GOOGLE_PLACES_API_KEY is missing"}` → info disclosure of internal config names. Minor.
- **E (Low):** `/api/customer-auth/enter-tenant` accepts any organizationId including junk → issues membership JWT for nonexistent org (harmless, downstream 404s; could 404 early).
- Dependency CVEs (from npm audit, earlier notes): brace-expansion (high), ip-address (high, express-rate-limit transitive SSRF), react-router-dom <7.18.0 (open redirect/XSS, moderate), exceljs uuid (moderate).

## Not findings
- NoSQL injection probes → no exploitation (Mongoose typed schema + auth failure).
- No path traversal, no command injection, no eval, no XSS sinks (no innerHTML/dangerouslySetInnerHTML).
- No IDOR: cross-tenant reads/writes blocked server-side from JWT scope; report exports scoped to JWT org.
- No secrets in git history (trufflehog/grep verified; only the documented dev fallback "dev_only_insecure_jwt_secret_change_me" in server.js, never a real credential).
- Image uploads: byte-sniffed PNG/JPEG/WebP only, size-limited, nosniff.
- Subscription keys: 75-bit random, atomic claim (findOneAndUpdate unused→redeemed), refund on failed activation.
