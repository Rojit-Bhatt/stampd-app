# Bug: Second outlet stuck on the green spinner

## What the customer sees
Open outlet A → it loads normally. Go back to /explore → tap outlet B → the page shows only the green spinning circle forever.

## Root cause (verified against the code, not guessed)

CustomerLayout (the customer app shell) is mounted **once** for the whole
`/:companySlug/:outletSlug/*` subtree. Navigating A → B only changes route
params; the layout does not remount. TenantSessionSync re-fires
`ensureTenantSession(newSlug, newOrgId)` as soon as the new outlet's
`/api/tenant` query resolves.

Two fixes were recently added (commits 34e13ee, e32e3b3) that together form
the deadlock:

1. **The race guard (`latestTenantRequestRef`) in `CustomerAuthContext`** — a
   single shared `customer_auth_token` slot, so two concurrent
   `enter-tenant` calls could clobber each other. It tracks the most recently
   *requested* outlet and discards any response whose key no longer matches
   `latestTenantRequestRef.current`.

2. **The stale-session gate (`sessionStale`) in `CustomerLayout`** — while the
   tenant JWT still belongs to the *previous* outlet, the whole shell renders
   the full-screen spinner.

The race guard works by keying on `tenantOrgId || _slug`. TenantSessionSync
passes `tenant.id` as the org id, and the backend's `/api/tenant` returns
`id` — the **MongoDB ObjectId** (e.g. `6a9c…`) of the outlet document.

**The failure mode for the second outlet:**

- `enter-tenant` succeeds and returns a tenant JWT **signed for the new
  outlet** (`organizationId = tenant.id`).
- `persistTenant(token, user)` writes it to localStorage and state.
- BUT on a fast second navigation, the *later* `ensureTenantSession` call
  (started immediately when TenantProvider set the tenant ref for outlet B)
  has already become "latest", and the response for the *first* one is
  discarded. If the discarded response was the one that arrived, or if two
  calls complete and the earlier one wins the localStorage write, the token
  in state/localStorage can belong to a DIFFERENT outlet than the one on
  screen.
- `sessionStale = Boolean(tenant) && tokenOrgId !== tenant?.id` then reads
  **true permanently**: `tokenOrgId` comes from the stored JWT, `tenant.id`
  from the URL. Nothing ever re-issues a fresh token because
  TenantSessionSync's effect depends on `[tenant?.slug, tenant?.id]`, which
  does **not change** on the second visit (the query result is the same
  object), so the effect never re-fires to retry. The layout sits on the
  spinner forever.

Concretely, the stuck loop state is:
`token = JWT(outlet A)` | `tenant = { slug: B, id: idB }` → sessionStale =
true → spinner. No effect fires → nothing ever updates token → permanent
spinner. The first outlet opens fine because `token` is null at mount, the
guard is uncontested (single request), and sessionStale starts false
(`Boolean(tenant)` is false until the tenant query settles; then the single
`enter-tenant` response matches the request key).

**Which exact request wins is timing-dependent, which is why it reproduces
reliably as "first outlet works, second one hangs" rather than randomly.**

## Fix (root cause, not symptom)

CustomerLayout's gate treats "token belongs to a different tenant" as a
permanent terminal state, but that state is also exactly the moment when a
fresh token *should* be requested. Two independent changes:

1. **In `ensureTenantSession`**: before the early-return "stale response"
   guard, also handle the *opposite* problem — when the stored JWT's
   organizationId does not match the tenant being viewed, do NOT wait for
   the caller to re-fire: request a fresh `enter-tenant` exchange for the
   current tenant immediately (the stored global session is still valid;
   only the tenant JWT is wrong). This guarantees the shared token slot is
   corrected even if TenantSessionSync never re-fires.

2. **In `TenantSessionSync`**: fire the effect on the resolved `tenant`
   object reference only when its id/slug is already loaded — but the real
   fix is #1, which is self-sufficient. Keep the effect as-is but also call
   `ensureTenantSession` on mount of the sync component (it already does)
   and, importantly, make CustomerLayout request a fresh exchange instead
   of rendering a spinner when `sessionStale` is detected — a stale session
   is a recoverable state, not an error.

Safest minimal combination: make `ensureTenantSession` *always* exchange a
fresh tenant JWT when the cached JWT's organizationId mismatches the
requested tenant, instead of trusting the cache path. This both fixes the
stuck state and preserves the race guard's purpose (discarding late
responses for outlets no longer on screen).

## Regression test

Backend-level: verify `enter-tenant` returns a JWT whose `organizationId`
matches the tenant resolved from the request's tenant headers (belongs in
the customer-auth test suite, tests/customer-auth*.js).

Frontend-level (the actual bug): a unit test of the
ensureTenantSession/stale-cache path — simulate a localStorage JWT with a
mismatched organizationId, call ensureTenantSession, assert a fresh
`/api/customer-auth/enter-tenant` POST is made and the cached token is
replaced. (The frontend has no Vitest setup currently; check tests/ for the
backend and the frontend test story before committing to a frontend test
file — may need to add vitest or place the check in the backend suite
where token issuance is testable end-to-end.)

## Verification (before claiming done)

1. Local reproduction of the race (two near-simultaneous calls) proves the
   fix by the test going green after the change.
2. Run the full backend suite (`tests/*.js`) — CI runs these on push.
3. Deploy frontend via `scripts/deploy-frontend.sh` (after confirming with
   the user), then live smoke test (`scripts/smoke-prod.js`).
4. User verifies in their browser: outlet A → explore → outlet B loads.

## Sensitive actions requiring confirmation

- Database: none (read-only check acceptable, write NOT needed).
- Deploy: frontend deploy + push to main (backend auto-deploys).
