# Secret rotation runbook (G21)

Cadence: **quarterly**, on the first working day of the quarter. Emergency
rotation (suspected leak) skips the schedule and runs this same checklist
immediately. Every rotation happens through Render's environment-variable
update — never by editing committed files (except the rotation log below).

## Quarterly checklist

| # | Secret | Where it lives | Rotation step |
| --- | --- | --- | --- |
| 1 | `JWT_SECRET` | Render env | Generate 32+ random bytes; update in Render; **production users are signed out instantly** (tokens carry the old secret — nothing to migrate) |
| 2 | `JWT_GLOBAL_SECRET` | Render env | Same as above — global sessions die at once |
| 3 | `MFA_SECRET` | Render env | Rotating this **wipes every enabled MFA enrollment** (secrets are encrypted under it); warn users via broadcast first, tell them to re-enroll |
| 4 | `BREVO_API_KEY` | Render + Brevo console | New key in Brevo → update Render → old key revoked |
| 5 | `SMTP_PASS` | Render + mail provider | Change at provider → update Render |
| 6 | `GOOGLE_CLIENT_ID` (+ secret in Render) | Google Cloud console | Rotate in console → update Render |
| 7 | `GOOGLE_PLACES_API_KEY` | Render + Google console | Restrict-by-referrer check still valid; rotate in console → update Render |
| 8 | `PUSH_VAPID_{PRIVATE,PUBLIC}_KEY` | Render + frontend build | New keypair → update backend env → **rebuild and redeploy frontend** (public key is baked into the PWA) |

## After every rotation

1. Update `docs/ops/rotation-log.md` with date, rotated secrets, and who ran it.
2. Re-run the Phase 0–3 verification gate: full backend suite, frontend
   build, `gitleaks`, `npm audit --audit-level=high --omit=dev`, boot smoke.
3. Confirm in Render that the deployment rolled from the env change with a
   healthy `/health` and that the cron-trigger failure alert (`TRIGGER_FAILURE_ALERT_EMAIL`)
   still reaches its inbox (the next daily run is the real test).

## Rules

- Never commit real secrets; `.env.example` stays a template.
- `git grep -iE "api[_-]?key|secret|password" -- . ':!*.md' ':!docs/*'` before
  every rotation to catch accidental secrets in code.
- If a JWT secret is rotated outside the quarterly window, the session
  hardening design means every user re-authenticates — no revocation table
  needed, but expect a support spike for ~24h.
