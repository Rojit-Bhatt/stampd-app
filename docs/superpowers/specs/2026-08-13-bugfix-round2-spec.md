# Spec — Bug-fix Round 2 (4 reported issues)

**Date:** 2026-08-13 · **Status:** Draft → approved by user (fix on localhost, verify in browser)

## Context

Tasks 5–10 shipped to production in the previous session. The user tested production and reported four problems. Root-cause analysis is complete; this spec covers the fixes.

## Problem statements

| # | Report | Root cause |
| --- | --- | --- |
| B1 | Sortable headers on Customers/Redeem "isn't working" | Sort code is intact in main. Suspect either (a) merge regression hiding state updates, (b) identical data making asc/desc visually identical, or (c) click not registering on narrow widths. Fix = verify with varied data in dev; harden click target (add `type="button"` already present, ensure buttons not overlapped by sticky-first CSS which got dropped — see B4). |
| B2 | Platform admin needs a Customers detail section | Feature request: platform-wide registered-customer list (all CustomerAccount documents, verified or not), with per-customer details. |
| B3 | WhatsApp "Talk to us" opens chat but no pre-filled message | Production links DO carry `?text=` (verified live), but WhatsApp's `wa.me` handler can drop the text param when the app intercepts the URL (observed on iOS/Android real devices). Fix: use `https://api.whatsapp.com/send?phone=<digits>&text=<msg>` which reliably pre-fills on both platforms. |
| B4 | Horizontal-scroll table distorts at the first scroll (screenshots) | Confirmed: when PR #26 (sortable headers) was merged, the merge resolution used `--ours` for `AdminCustomers.tsx`, which dropped the `<ScrollableTable>` wrapper introduced by PR #24. The customers table no longer has the horizontal-scroll container or sticky first column — scrolling reveals raw column overflow with misaligned dividers. |

## Requirements

**B1 — Sortable headers work reliably.** Clicking a header cycles order (asc → desc → default newest-first). Visual change must be obvious even with few rows. Keep accessible aria-labels.

**B2 — Platform Customers section.** A new page under the platform admin console listing every registered customer with name, email, phone, company membership, registered date, verification status; search + sortable columns + Excel export optional but consistent with the rest of the platform.

**B3 — WhatsApp pre-filled messages actually appear.** Every "Talk to us" (pricing tiers + floating chat) uses `api.whatsapp.com/send` with `phone` and URL-encoded `text` params. Number must be digits only; fallback `#pricing` unchanged.

**B4 — Table scroll distortion gone.** Restore the `ScrollableTable` wrapper with sticky first column on the customers table (header row and body rows). Same treatment as Transactions/Menu pages.

## Acceptance criteria

1. On a narrow viewport (< 760px) the customers table scrolls horizontally without layout distortion; the Customer column stays pinned.
2. Header clicks on Points/Redeemed/Last visit change row order visibly in dev with varied data, and the arrow icon reflects the current direction.
3. Pricing tier CTAs and the floating WhatsApp button open `https://api.whatsapp.com/send?phone=…&text=…` with the plan-specific message; no message when no phone is configured (`#pricing`).
4. Platform analytics nav has a Customers entry leading to a page listing all registered customers across companies with the same shell/styling as Companies/Team pages.
5. Frontend lint passes; no regressions on Transactions, Menu, Company Reports/Impact, Platform pages.

## Out of scope

Changing the sort algorithm semantics (already agreed), altering pricing/plan data, redesigning the platform shell.
