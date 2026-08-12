#!/usr/bin/env bash
# Stampd — check whether the pinned base image in backend/Dockerfile still
# matches the registry manifest for its tag. Run it on a schedule (weekly
# is fine); a changed digest means the upstream tag moved and the pin in
# the Dockerfile should be refreshed (and the image rebuilt/retested).
#
# Exit 0 = pin matches | exit 1 = mismatch | exit 2 = usage error.
set -euo pipefail

DOCKERFILE="${1:-backend/Dockerfile}"
[ -f "$DOCKERFILE" ] || { echo "Dockerfile not found: $DOCKERFILE" >&2; exit 2; }

line=$(grep -m1 '^FROM ' "$DOCKERFILE")
image=$(echo "$line" | awk '{print $2}')
tag="${image%%@*}"
pin="${image#*@}"
pin="${pin#@sha256:}"
pin="${pin#sha256:}"

repo="${tag%%:*}"
tag_name="${tag#*:}"

token=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/${repo}:pull" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")

# The Docker-Content-Digest header on the manifest response is the canonical
# digest for that tag; a HEAD request avoids downloading the manifest.
header=$(curl -s -I -H "Authorization: Bearer $token" \
  -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
  "https://registry.hub.docker.com/v2/library/${repo}/manifests/${tag_name}" \
  | grep -i docker-content-digest | head -1 | tr -d '\r')
remote="${header##*sha256:}"

echo "pinned : ${pin}"
echo "remote : ${remote}"
if [ "$pin" = "$remote" ]; then
  echo "OK — pin matches the registry manifest for ${tag}"
  exit 0
fi
echo "MISMATCH — upstream tag ${tag} moved; refresh the pin in ${DOCKERFILE} and rebuild."
exit 1
