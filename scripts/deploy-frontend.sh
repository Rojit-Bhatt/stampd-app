#!/bin/bash
# Deploys the fresh frontend build to the "stampd" worker on Cloudflare
# using wrangler's static-assets support (wrangler.jsonc in frontend/).
set -e
cd "$(dirname "$0")/.."

# The token can come from the environment (e.g. GitHub Actions secrets or a
# local shell export) — it must never live in the repo: GitHub secret
# scanning blocks any push that contains it.
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN before deploying}"
export CLOUDFLARE_ACCOUNT_ID="d34229f93ab7aa8e06bfacb7febe25cc"

# Fresh build: must produce plain (uncompressed) outputs. The Vite env var is
# the same value wrangler's custom build command embeds, so the local build
# and wrangler's build produce identical artifacts.
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://api.stampdd.club}"
cd frontend
npx -y pnpm@9 run build

# Deploy the built dist as static assets of the stampd worker.
npx -y wrangler deploy --outdir=/tmp/wrangler-out

# Fingerprint the build that was ACTUALLY deployed. wrangler's custom build
# re-runs the Vite build itself and ships THAT output; if its fingerprint
# diverges from the local build above, we verify against the shipped one
# instead of falsely failing. (See docs/bug/turnstile-google-diagnosis.md.)
SHIPPED_HASH="$(sha256sum dist/assets/index-*.js | awk '{print $1}')"
VERIFY_HASH="$SHIPPED_HASH"

# Post-deploy verification — never assume a deploy worked. Lesson from the
# 2026-08-13 outage: the deploy "succeeded" but silently shipped a worker
# with no /api proxy, disconnecting the whole site for hours. The smoke test
# proves the live stack (SPA, API proxy, CORS, tenant, health) still works
# end-to-end before the deploy is declared done. A 15s settle gives the new
# version time to roll out on the edge.
sleep 15
SITE="${SITE:-https://stampdd.club}" API_BASE="${API_BASE:-https://api.stampdd.club}" node scripts/smoke-prod.js
./scripts/verify-live-bundle.sh "${SITE:-https://stampdd.club}" "$VERIFY_HASH"
echo "Deploy verified — the live site is serving the SPA and the API."

