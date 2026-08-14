# Disaster Recovery Runbook (G11)

## Assumptions

The production database is MongoDB (Atlas in the planned setup). Loyalty
balances live in an **append-only points ledger** — that is the asset a
restore must protect above all else. Configuration (programs, tiers, outlets)
is recreatable; the ledger is not.

## Backup policy

| Item | Target | How |
|---|---|---|
| Continuous backup | Atlas continuous cloud backup (PIT) | Enable in Atlas UI under Backup |
| Scheduled snapshot | Daily + weekly | Atlas snapshot schedule |
| Sanity digest | Daily 09:00 cron (`checksumService`) | Document count + total points balance, stored per-day; drift = corruption signal |
| Alert | Email to `TRIGGER_FAILURE_ALERT_EMAIL` | Wired into `server.js` cron wrapper + `sendEmail` |

The sanity digest is not a backup — it is the *detection* half. A restore is
only credible if corruption is noticed before it compounds.

## Restore procedure

1. **Stop writes**: pause the Render service (or flip a feature flag) so no
   new earns/redemptions race the restore.
2. **Pick the target**: Atlas Restore → choose the PIT closest before the
   incident, or the nearest clean snapshot. Prefer PIT: it can exclude the
   bad window.
3. **Restore to a NEW cluster** first — never over the live one.
4. **Verify**: run the platform sanity checksum endpoint
   (`GET /api/platform/sanity-checksum` with owner token) against the
   restored cluster and compare with the last good digest from the daily
   email. Document counts and total points balance must match to the cent.
5. **Repoint**: once verified, repoint `MONGODB_URI` at the restored cluster
   and restart.
6. **Reconcile**: anything written after the restore point (the paused
   window) is re-entered manually from outlet records; the app's own
   `platform-sanity-checksum` test suite doubles as the reconciliation
   checklist.

## Drill cadence

One actual restore drill per quarter, recorded in this repo's issues with
the measured restore time. Target: **RTO ≤ 30 min, RPO ≤ 24 h** (PIT can do
better).

## Failure scenarios

| Scenario | Action |
|---|---|
| Cluster unresponsive | Render restart → Atlas status page → failover to secondary region if Atlas offers one |
| Corruption detected by digest drift | Stop → restore from PIT before corruption window → reconcile |
| Accidental destructive migration | Restore from snapshot before the migration commit + repoint |
| Region outage | Atlas multi-region replica set handles failover; Render follows `MONGODB_URI` |
