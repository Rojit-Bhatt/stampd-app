#!/bin/bash
# verify-live-bundle.sh — prove the LIVE site is serving the just-deployed
# frontend build, and that it contains the outlet-switch fix.
#
# Usage: ./scripts/verify-live-bundle.sh <SITE> <expected-index-bundle-hash>
#   SITE: e.g. https://stampdd.club
#   expected-index-bundle-hash: sha256 of the index-*.js built in this run
#     (the built file is matched by glob frontend/dist/assets/index-*.js;
#      the workflow passes its sha256sum output).
#
# Exits non-zero on any failure — the deploy job fails and nothing is
# declared done. A deploy "succeeded" is not evidence; this script is.
set -u
SITE="${1:?Usage: verify-live-bundle.sh <SITE> <expected-index-bundle-hash>}"
EXPECTED_HASH="${2:?Missing expected index bundle hash}"

FAILURES=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1${2:+: $2}"; FAILURES=1; }

# --- 1. The SPA HTML must reference an index asset ---
INDEX_URL="$SITE/"
HTML=$(curl -sf "$INDEX_URL" || { fail "GET $INDEX_URL did not return HTML"; echo "$FAILURES"; exit 1; })
ASSET=$(echo "$HTML" | grep -oE 'src="[^"]*index-[^"]*\.js"' | head -1 | sed 's/src="//;s/"//')
[ -n "$ASSET" ] || { fail "SPA index.html contains no index-*.js script tag"; echo "$FAILURES"; exit 1; }
pass "SPA references $ASSET"

# --- 2. Fetch the live bundle and compare its hash to the built one ---
BUNDLE_URL="${SITE}${ASSET}"
TMPBUNDLE=$(mktemp /tmp/live-bundle-XXXXXX.js)
curl -sf "$BUNDLE_URL" -o "$TMPBUNDLE" || { fail "could not fetch $BUNDLE_URL"; rm -f "$TMPBUNDLE"; echo "$FAILURES"; exit 1; }
LIVE_HASH=$(sha256sum "$TMPBUNDLE" | awk '{print $1}')
rm -f "$TMPBUNDLE"
[ "$LIVE_HASH" = "$EXPECTED_HASH" ] || {
  fail "live bundle hash mismatch: built=$EXPECTED_HASH live=$LIVE_HASH (a stray older build is still being served)"
  echo "$FAILURES"; exit 1
}
pass "live bundle $BUNDLE_URL matches the build from this run (sha256 $LIVE_HASH)"

# --- 3. The deployed bundle must carry the outlet-switch fix markers ---
#    The marker strings must survive Vite's esbuild minification (local
#    variable names like `cachedOrgId` and `sessionStale` get mangled), so we
#    match logic-shaped fragments the minifier preserves verbatim:
#      a) CustomerAuthContext's active recovery: when the cached tenant JWT
#         belongs to a DIFFERENT outlet (wrong `organizationId`), the app
#         POSTs /api/customer-auth/enter-tenant to exchange for a fresh
#         tenant JWT instead of spinning forever. Matched by the literal
#         string `"/api/customer-auth/enter-tenant"` combined with the
#         wrong-org comparison fragment `organizationId!==G` (the exact
#         minified comparison from ensureTenantSession).
#      b) A second independent marker: the tenant-scoped JWT decode path
#         `organizationId)` near the global-session exchange, so a build
#         missing the fix entirely fails the check.
TMPBUNDLE=$(mktemp /tmp/live-bundle-XXXXXX.js)
curl -sf "$BUNDLE_URL" -o "$TMPBUNDLE" || { fail "could not re-fetch $BUNDLE_URL for marker check"; rm -f "$TMPBUNDLE"; echo "$FAILURES"; exit 1; }
for m in 'organizationId!==G' 'enter-tenant"'; do
  grep -qF "$m" "$TMPBUNDLE" && pass "live bundle contains fix marker '$m'" ||
    fail "live bundle MISSING fix marker '$m' (the outlet-switch fix is not deployed)"
done
# --- 4. Regression guard: the Cloudflare Turnstile verification was removed
#    on 2026-08-14 and must never come back. The widget's script URL
#    (challenges.cloudflare.com/turnstile/v0/api.js) is a stable string the
#    minifier preserves verbatim, so its absence from the live bundle proves
#    the removal is deployed.
grep -qF "challenges.cloudflare.com" "$TMPBUNDLE" &&
  fail "live bundle STILL contains 'challenges.cloudflare.com' (the removed Turnstile verification has come back)" ||
  pass "live bundle does not contain 'challenges.cloudflare.com' (Turnstile removal held)"
# --- 5. Regression guard: the Google sign-in button must be present ---
#     The build embeds the full Client ID literal (it is read from
#     VITE_GOOGLE_CLIENT_ID by App.tsx/AuthView/login pages). If the
#     GOOGLE_CLIENT_ID repo secret is missing, the build strips the button
#     entirely — this check proves the deployed build carries it.
#     The Client ID string survives minification verbatim (it is a plain
#     import.meta.env value concatenated into literals).
if [ -n "${GOOGLE_CLIENT_ID_EXPECTED:-}" ]; then
  grep -qF "$GOOGLE_CLIENT_ID_EXPECTED" "$TMPBUNDLE" &&
    pass "live bundle contains the Google Client ID (Google sign-in is deployed)" ||
    fail "live bundle MISSING the Google Client ID '$GOOGLE_CLIENT_ID_EXPECTED' (the Google sign-in button is not deployed)"
fi
rm -f "$TMPBUNDLE"

[ "$FAILURES" -eq 0 ] || { echo "$FAILURES failures — deployed frontend is NOT the expected build"; exit 1; }
echo "verify-live-bundle: the live site is serving the just-built, fixed frontend."
exit 0
