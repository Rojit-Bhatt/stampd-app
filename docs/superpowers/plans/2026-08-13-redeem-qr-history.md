# Plan — bug-fix round 3 (branch `fix/redeem-report-review-qr`)

## Order of work
N1 → N2 → N3 (frontend/backend interleaved per item), then verify all, then PR + merge.

## N1 — Review QR footer removal (frontend only)
File: `frontend/src/routes/platform/reviewqr/ReviewFlyer.tsx`
1. Delete the footer draw block at lines 178–180 (`Made free with Stampd · stampd.co`).
2. No layout rebalance needed — the remaining "Scan with your camera" / "ten seconds" lines sit above; verify visually that the flyer doesn't look bottom-heavy.
3. Confirm `buildQrOnlyCanvas` (lines 83–104) already paints white background + centred logo — it does; no change. (If the downloaded QR's `bgColor` transparent source matters, it's already handled: white fill before drawImage.)
4. Lint.

## N2 — Redemptions per day: only active days, newest first (backend + frontend check)
File: `backend/services/reportService.js` (`getRedeemStats`)
1. Keep the all-days bucket loop (needed for nothing → replace): instead of pre-filling every calendar day, build buckets only from actual transactions (Map from `dayKey(t.createdAt)`), so quiet days never appear.
2. Keep existing newest-first sort (line 372 already desc) — verify stays desc.
3. Empty state: AdminReportsRedeems already shows an empty-state message when `daily.length === 0` — check what it says; if it says "no redemptions" fine.
4. Lint + backend restart; verify on `/reports/redeem`.

## N3 — Real customer names + values (backend + frontend check + optional seed)
Files: `backend/services/reportService.js`, `backend/models/RewardItem.js`, reward config UI + `backend/services/pointsService.js` redeem path.

### 3a. Customer name
In `getRedeemStats`, after fetching txns:
1. Collect distinct `userId`s; batch `User.find({ _id: { $in: ids }, organizationId })`; build nameById Map.
2. Map row `customer` to `nameById.get(userId) || performedByName || "Unknown"`.
3. No frontend change needed (AdminReportsRedeems renders `customer` string as-is).

### 3b. Indicative value on RewardItem
1. `backend/models/RewardItem.js`: add optional field `valueNpr: { type: Number, default: null }` (integer rupees, nullable — keeps old docs valid; null = no known value).
2. Reward form UI (menu config page's reward editor — find the reward create/edit form, likely `frontend/src/routes/admin/AdminMenu.tsx` or similar reward form): add an optional "Value (Rs)" number input bound to `valueNpr`.
3. `pointsService.js` redeem branch (line ~597): record
   `rewardValueNpr: item.kind === "menu" ? (item.doc.price ?? null) : (item.doc.valueNpr ?? null)`.
4. `reportService.js` keeps `value: t.rewardValueNpr ?? null`; Excel export uses `r.value ?? ""` (already fine).
5. Excel export header "Value (Rs)" matches.

### 3c. Demo seed (visual verification only)
`backend/seed/demoSeed.js`: seed 2–3 redeem transactions on distinct dates with the demo customers + menu item (Affogato) so the report shows populated rows. Use PointsTransaction.create directly with realistic fields (type "redeem", pointsCenti neg, rewardName/rewardValueNpr/ performedByName, plus a matching PointsBalance deduction to stay consistent is optional for demo). Simpler: seed transactions only; balances may mismatch but demo is throwaway. If demoSeed doesn't import models conveniently, seed inside `ensureX` boot flow where other demo transactions are created (check for existing "seed" transaction creation in demoSeed — likely there are earn transactions already; reuse that helper).

## Verification checklist (same session)
1. Lint passes.
2. Backend restart; `curl` the redeem stats endpoint with a fresh token → daily contains only 2026-08-13 rows (the seeded day), rows newest first; rows show "Asha Sharma" etc. and value where seeded.
3. Browser: login durbarmarg@coffesarowar.com → /reports/redeem → table matches.
4. Download QR + flyer from /review-qr; inspect PNGs (Python PIL check corner pixel white, centre logo, footer absent) and decode QR.
5. Excel export via curl → openpyxl dump.
6. Commit, push, PR #34 (squash merge to main), pull, restart backend, final spot-check, summary.

## Risks
- RewardItem model change requires no migration (optional field; mock DB ignores schema).
- If the reward form isn't a single shared component, the value input must be added to all reward editors (search `RewardItem` usage in frontend).
- Demo seed touches DB shape only in-process; no risk to production.
