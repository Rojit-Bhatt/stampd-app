# Task 4 Report — Optimistic UI Updates

Commit: `a5a57fb` on `perf/perf-tasks` (local, not pushed).

## Objective

Make user actions update the screen immediately as if they succeeded, then reconcile with the server result and roll back gracefully with a visible message on failure.

## Implementation

All mutations were converted to optimistic updates using TanStack Query v5's `onMutate`/`onError`/`onSettled` pattern: snapshot the current cached list, apply the change locally in `onMutate`, roll back to the snapshot in `onError`, invalidate/refetch in `onSettled`, and show `toast.error("… — restored.")` so users are never silently misled.

| File | Mutations made optimistic |
|---|---|
| `frontend/src/hooks/useCampaigns.ts` | 3 (create, update, toggle pause) |
| `frontend/src/hooks/useBroadcasts.ts` | 3 (create, update, send) — explicit `useMutation<BroadcastPayload, Error, Vars>` generics required by tsc |
| `frontend/src/hooks/useStaff.ts` | invite, update role, remove staff; fixed `useSetStaffPin` to reconcile via `reconcileStaff(qc)` |
| `frontend/src/routes/admin/AdminRewards.tsx` | update reward, remove reward |
| `frontend/src/routes/admin/AdminEvents.tsx` | deleteEvent |
| `frontend/src/routes/admin/MenuManagement.tsx` | createItem (seeded with required MenuItem fields), patchItem, deleteItem |

## Verification

- `frontend/scripts/optimistic-check.mjs` — 5/5 PASS: simulates a 2 s server delay and a forced 500; perceived update is ~1 ms on the happy path, and on failure the UI restores byte-for-byte to the pre-action snapshot with a visible error toast.
- `pnpm lint` (tsc --noEmit): green, including strict generic typings on the broadcast mutation.
- `pnpm build`: green.
- Existing backend suites unaffected (UI-only change; no backend contract changes).

## Notes

Only shared-admin actions were made optimistic; personalized reads (customer balance, loyalty status) still wait on the server to avoid any risk of showing incorrect points or rewards. Rollback uses deep-cloned snapshots rather than inverse operations so concurrent edits by other users reconcile correctly on the `onSettled` refetch.
