# Spec — Redeem report polish + redemption data completeness (bug-fix round 3)

Date: 2026-08-13 · Scope: 3 user-reported issues, one delivery branch, merged to `main`.

## 1. Context

The outlet admin's Redeem Report (`/reports/redeem`) is missing useful information and the review QR flyer still carries a branding footer the owner does not want.

## 2. Requirements

### N1 — Review QR download
The "Download QR only" artwork on the `/review-qr` page must:
1. Have an opaque **white background** (currently already implemented: `buildQrOnlyCanvas` paints `#FFFFFF`).
2. Carry the **Stampd logo centred on the QR** (already implemented: `/pwa-512x512.png` at 18% of QR width inside a level-M code).
3. **Remove the "Made free with Stampd · stampd.co" footer text** from the downloaded **flyer** — the owner's reference image shows it rendered under the QR; the owner does not want it. The flyer keeps "Scan with your camera" and "It takes ten seconds. Thank you.".
Acceptance: both PNG downloads print cleanly; QR scannable (verify by decoding the downloaded PNG in Python with pyzbar/zxing or by comparing against the review URL); no "Stampd" branding text in either download.

### N2 — Redemptions per day
The Redeem Report's "Redemptions per day" table must:
1. **Show only dates on which at least one redemption happened** (no all-zero filler rows).
2. Order rows **newest first**.
Acceptance: for a 30-day range where redemptions occurred on only 3 days, the table shows exactly 3 rows, newest at top; export matches the on-screen rows.

### N3 — Redemption history: real customer names and real values
The Redeem Report's "Redemption history" table must identify the redeeming customer and show a rupee value where one exists:
1. **Customer column** resolves the actual customer's display name from the transaction's `userId` (batched `User` read, same pattern as `getOutletTransactions`). Staff-initiated redeems keep the staff attribution (`performedByName`) as secondary info only if needed; the primary identity is the customer whose points moved. Fallback "Unknown" only when the user doc truly cannot be found (deleted account).
2. **Value (Rs) column** is populated for every redemption that has a known rupee price:
   - Menu-item redemptions already record `rewardValueNpr` from the MenuItem price — keep working.
   - RewardItem redemptions (e.g. "Food voucher (chess)") currently record `null` because RewardItems have no price field by design. Add an **optional `valueNpr` (integer, paisa-style cents optional — use plain integer rupees for simplicity... see plan for decision) field on RewardItem**, surfaced in the reward config UI as an optional "indicative value". The redeem ledger records it at redeem time; past rows without a value stay "—".
3. Future redemptions capture both pieces; past rows that lack them remain marked "—" / "Unknown (deleted)" — explicitly communicated in the acceptance notes, not silently guessed.
Acceptance: after a fresh demo redeem flow (or by verifying a seeded redeem transaction), history rows show the customer's real name and, where a value exists, the number instead of "—"; the Excel export carries the same data.

## 3. Non-goals
- No migration/backfill of historical rows (mock DB anyway; production data will accrue the new fields naturally).
- No redesign of the redeem report layout, charts, or the review flyer artwork beyond the footer removal.
- No change to tier/points math.

## 4. Test plan
1. `npm run lint` (tsc) passes after every change set.
2. Backend restart → seed demo redeems if the seed doesn't already create any (check `demoSeed.js`; if absent, seed 2–3 demo redeem transactions with distinct dates so N2 and N3 are visually verifiable).
3. Browser on `localhost:3000`, outlet admin console `/reports/redeem`: 3-row table check (N2), real names + values (N3).
4. Download both PNGs from `/review-qr` and decode/inspect: white pixel at corner, logo present centre, no Stampd footer text; QR decodes to the review URL.
5. Excel export of the redeem report verified via openpyxl.
