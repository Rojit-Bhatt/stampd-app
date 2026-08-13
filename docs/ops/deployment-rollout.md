# Deployment + staged rollout (G16)

## Current production topology

| Layer | Host | Deploy trigger |
| --- | --- | --- |
| Backend API | Render web service | Push to production branch (today: `main` post-PR) |
| Frontend PWA | Cloudflare Workers Static Assets (`wrangler deploy`) | Frontend CI step / manual |

## The flow (PR → staging smoke → prod)

1. **Pull request.** CI runs the full gate: gitleaks scan, `npm audit --audit-level=high --omit=dev`,
   the complete backend test suite (every suite boots its own server against the
   in-memory DB), frontend typecheck + production build. No PR merges without green.
2. **Staging.** When a staging Render service + preview branch exist, push the
   PR branch there first. Staging gets the same env layout as production
   (mirrored in `render.yaml`) with a throwaway `JWT_SECRET`/`JWT_GLOBAL_SECRET`
   and a disposable Mongo database — never production credentials.
   Staging smoke = full backend suite + `/health` + a login/earn/redeem walk-through.
3. **Production.** Merge after staging green. Render rebuilds from the new
   commit; `/health` must return `{"status":"ok"}` within the deployment timeout
   before traffic is cut over.
4. **Rollback.** Semantic versioning + GitHub Releases: `git tag vX.Y.Z` on the
   production commit, cut a Release with notes. A rollback is
   `git revert` or re-pointing Render at the tagged commit — the release notes
   say exactly what behaviour came in with that build.

## Versioning

`X.Y.Z` with `X` for breaking tenant-API behaviour, `Y` for additive features
(all security hardening to date is additive and lands under `Y`), `Z` for
fixes. Release notes mirror the PR titles of the included changes.

## Frontend

The PWA build (`npm run build -w frontend`) is reproducible from the lockfile;
the deployed bundle lives behind Cloudflare's immutable caching, so every
release bumps the asset hashes and the service worker picks up the new
`sw.js` on next navigation. Verify the new hash in the Cloudflare dashboard
after deploy before closing a release ticket.
