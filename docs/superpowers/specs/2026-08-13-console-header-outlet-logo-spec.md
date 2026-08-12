# Spec — Outlet console header shows the configured branding logo

**Date:** 2026-08-13 · **Author:** Manus AI
**Related files:** `frontend/src/components/admin/AdminLayout.tsx`, `frontend/src/lib/images.ts`, `frontend/src/components/customer/CustomerLayout.tsx` (precedent)

## Problem

The outlet console rail renders a generic identity tile in its top-left corner: a rounded square filled with the outlet's brand colour containing the first letter of the business name. An outlet admin can already upload a branding logo through Manage → Branding, and that logo is surfaced everywhere a customer sees the business (customer app, explore cards, business landing page) — but the console the admin and their staff use daily keeps pretending the outlet has no logo. Staff switching between a white-label outlet and a plain one have no visual cue that branding is configured.

## Requirements

**R1.** When the outlet has a configured logo (`settings.branding.logoImageId` / `logoUrl` non-empty after resolution), the console header tile in the top-left corner of the rail renders the logo image instead of the initial letter.
**R2.** When no logo is configured, the rail keeps its current behaviour exactly — brand-colour tile with the uppercase initial. No visual regression for unconfigured outlets.
**R3.** The logo tile is a 36×36 (h-9 w-9) rounded square, `object-cover`, at the same position as today — the rail geometry, name, and "Outlet console" subtitle do not move.
**R4.** The tile's background stays the outlet's brand colour, so transparent PNG logos sit on-brand instead of on grey.
**R5.** The same behaviour applies wherever the rail header renders: desktop sidebar, tablet/phone drawer, and the top mobile header. One change covers all because they share `railBody`.
**R6.** If the logo image fails to load, fall back to the initial-letter tile so the rail is never empty.
**R7.** No backend changes. `GET /api/admin/settings` already serialises the full `branding` object including `logoImageId` and `logoUrl` (`tenantController.js` lines 32/82/222), and the Branding save flow already writes them. The settings hook (`useAdminSettings`) already exposes `settings.branding`.

## Non-requirements

This spec does not touch the Branding page, image upload, tile colour, name typography, nav structure, mobile nav behaviour, or the Earn/Redeem actions. It does not change any API contract, cache policy, or the customer-facing surfaces.

## Acceptance criteria

1. Given an outlet with a logo uploaded via Branding, the console rail's top-left tile shows the logo image (36×36, rounded square, brand background) and the name + subtitle render as before.
2. Given an outlet with no logo, the rail is byte-for-byte visually identical to today's initial-letter tile.
3. The change is visible in the desktop sidebar, the tablet/phone drawer, and the top mobile header.
4. A broken logo URL renders the initial-letter fallback, never a broken-image icon or an empty tile.
5. TypeScript, lint, and the production build pass; no horizontal overflow or layout shift in the rail.

## Out of scope for this spec

Per-outlet org switcher tiles, customer-app surfaces, banner rendering, and any animation work remain out of scope.
