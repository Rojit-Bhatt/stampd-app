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
#    Two independent markers so one chunk split doesn't hide a stale build:
#      a) CustomerAuthContext's active-recovery path (wrong-tenant JWT
#         exchange): the built token carries "cachedOrgId" comparison
#      b) CustomerLayout's sessionStale guard: the built token carries
#         "sessionStale"
# grep on a URL doesn't work; re-fetch is wasteful — read from file instead.
TMPBUNDLE=$(mktemp /tmp/live-bundle-XXXXXX.js)
curl -sf "$BUNDLE_URL" -o "$TMPBUNDLE" || { fail "could not re-fetch $BUNDLE_URL for marker check"; rm -f "$TMPBUNDLE"; echo "$FAILURES"; exit 1; }
for m in cachedOrgId sessionStale; do
  grep -q "$m" "$TMPBUNDLE" && pass "live bundle contains fix marker '$m'" ||
    fail "live bundle MISSING fix marker '$m' (the outlet-switch fix is not deployed)"
done
rm -f "$TMPBUNDLE"

[ "$FAILURES" -eq 0 ] || { echo "$FAILURES failures — deployed frontend is NOT the expected build"; exit 1; }
echo "verify-live-bundle: the live site is serving the just-built, fixed frontend."
exit 0
