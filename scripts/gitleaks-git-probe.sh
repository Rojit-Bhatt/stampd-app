#!/bin/bash
# Probe: temporarily add a fake AWS key on security-roadmap, commit, scan via gitleaks git, then remove.
set -e
cd /home/ubuntu/stampd-app
hash_now=$(date +%s)
echo "AWS_KEY_PROBE=AKIAIOSFODNN7EXAMPLE${hash_now}" > /tmp/probe-secret.js
git checkout -q security-roadmap 2>/dev/null
cp /tmp/probe-secret.js ./probe-secret.js
git add probe-secret.js
git commit -qm "probe: temp fake secret for gitleaks git-mode verification"
echo "--- scanning with gitleaks git (expect LEAK FOUND) ---"
gitleaks git --config .gitleaks.toml --log-opts="HEAD~1" 2>&1 | tail -6
echo "--- restoring: removing probe commit ---"
git reset -q --hard HEAD~1
git clean -fq -- probe-secret.js
echo "PROBE DONE"
