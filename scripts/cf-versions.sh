#!/bin/bash
# List the last N uploaded versions of the stampd worker for rollback.
set -e
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-d34229f93ab7aa8e06bfacb7febe25cc}"
SCRIPT_NAME="${1:-stampd}"
LIMIT="${2:-15}"
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$SCRIPT_NAME/content/v2/versions?per_page=$LIMIT" | \
  python3 -c "
import sys, json
d = json.load(sys.stdin)
if not d.get('success'):
    print(json.dumps(d)[:400]); sys.exit(1)
for v in d['result']:
    info = v.get('info', {})
    meta = info.get('metadata', {})
    print(v['id'][:12], info.get('uploaded', '?'), 'source:', meta.get('source', '?'), '|', meta.get('usage_model', ''))
"
