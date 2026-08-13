# Stampd App Security Roadmap — Implementation Report

**Branch:** `security-roadmap` (pushed to origin at `898e44c`, forked from `security-audit-fixes` at `63fa824`)
**Date:** August 13, 2026
**Scope:** The six remaining tickets from the August 2026 security audit, implemented with the Subagent-Driven Development workflow (brief → implement → test → commit → review gate → ledger) and verified against the full backend suite before each commit. The `main` branch was never touched.

## What was delivered

### T6 — CI secret scanning (commit `75c81e6`)

A Gitleaks PR gate (`.github/workflows/secret-scan-pr.yml`, `fail-build: true`) blocks any merge containing secrets, complemented by a weekly TruffleHog full-history sweep (Monday 03:00 UTC, verified findings only) via `.github/workflows/secret-scan-history.yml`. The allowlist is deliberately narrow — only the dev JWT marker in `server.js` and `env.example` references. A full-tree scan of the repository (241 MB) and of every file introduced by this branch found zero leaks.

### T1 — Rate limiting on expensive endpoints (commit `765b6d7`)

Three new per-IP limiters (10 requests / 15 minutes) protect the costliest surfaces: customer and report **exports** for both the admin and platform roles, and the **broadcast** creation endpoint (every broadcast create can fan out into paid SMS). They attach to five admin routes, two platform routes, and one admin POST, each after auth/permission so unauthenticated requests never pay a lookup. New test `tests/rate-limit-expensive.js` proves the caps, the per-role bucket independence, and that a 429 is returned without touching the controller. One product-decision note: the broadcast cap was set at 10/15 min rather than 5 because validation-failing requests consume the bucket; an admin deliberately mass-creating broadcasts is still rate-limited hard, but the cap accommodates normal admin tooling. The existing `broadcasts.js` suite was adapted (merged segments onto one outlet) so it stays under the cap with no semantic loss.

### T1b — Daily SMS quota (commit `87af062`)

A `DAILY_SMS_QUOTA` guard (env var, default 1,000) lives inside the single `sendSms` entrypoint, so every SMS path — broadcasts, canned triggers, anything future — shares one per-(company, outlet) per-UTC-day budget. The check runs before Sparrow is contacted and before any `SmsSendLog` row is written, and the over-limit response is the standard 429 body. New test `tests/sms-daily-quota.js` verifies the cap, the 429 shape, the absence of orphan log rows, and sibling-organisation isolation.

### T2 — Session versioning / instant revocation (commit `47951ad`)

`sessionVersion` fields were added to `CustomerAccount` and `AdminAccount`, included in every minted session token, and checked against the live DB row by all three verifiers (auth, customer global, company session) on each request. A password reset or change bumps the version, so stale tokens die immediately with a 401 "Session expired" — meaningful now that tokens live in localStorage. Global and company session lifetimes were halved from 60 to 30 days. The design is backward compatible: tokens without a version claim compare as `0 == 0` and keep working. One deliberate nuance: setting a *first* password on a Google-only account does not revoke sessions, because that is a consented same-session setup action and revoking it would break the customer setup flow. New test `tests/session-versioning.js` covers minting, revocation, re-login after change, and backward compatibility.

### T3 — CSP in report-only mode (commit `898e44c`)

A new `cspMiddleware` builds a strict, hash-based policy at boot from the inline scripts in the built `index.html`, sets it as `Content-Security-Policy-Report-Only` on HTML document responses only, and never on JSON API routes or static assets. The current Vite build contains no inline scripts, so `'strict-dynamic'` trusts the module bundle chain; the directive set closes the classic gadget classes (`object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, form-action self). Violation reports land at `POST /api/csp-report` (204) with a structured log line; browser kebab-case and camelCase bodies are both accepted. Deployment is intentionally report-only — nothing breaks on deploy, and enforcement becomes a follow-up step after a clean observation window. New test `tests/csp-report-only.js` boots the real production server (a small, documented extension to `bootServer` for this one suite) and asserts the header on the document, its absence on the API, and report ingestion.

## Verification summary

| Gate | Result |
| --- | --- |
| Full backend suite (final run) | Green except 3 pre-existing flakes, verified **identically failing on the baseline** (`impact` 4, `platform-contact` 2, `push-notifications` 1) |
| Focused new tests | `rate-limit-expensive`, `sms-daily-quota`, `session-versioning`, `csp-report-only` — all green, re-run for stability |
| Frontend build | Fresh `vite build` successful; production serving unchanged for your two live cafes |
| Secret scan | Gitleaks clean over the full working tree (241 MB) and over all 25 files introduced by this branch |
| Review gates | Each task passed an independent review of its full diff before proceeding |
| Push | `security-roadmap` pushed to origin; `main` untouched |

## Deployment notes

No client-side changes are required. Merge `security-roadmap` into the branch Render tracks, let Render rebuild, and restart. The Render environment should set `DAILY_SMS_QUOTA` if you want a value other than the 1,000 default. After a week or two, review the structured CSP violation lines in your server logs; if none appear, switch `cspMiddleware` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` for enforcement. The existing pre-existing flakes are documented as such and are not caused by any roadmap change.
