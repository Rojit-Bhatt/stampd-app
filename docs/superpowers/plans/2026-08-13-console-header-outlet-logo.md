# Plan — Console header shows the configured branding logo

**Date:** 2026-08-13 · **Author:** Manus AI · **Spec:** `docs/superpowers/specs/2026-08-13-console-header-outlet-logo-spec.md`
**Branch:** `feature/console-header-logo` · **Effort estimate:** ~30 min

## Context and diagnosis

The console rail header in `frontend/src/components/admin/AdminLayout.tsx` (the `railBody` fragment, ~line 170) renders a fixed initial-letter tile: brand-colour rounded square, `h-9 w-9`, `font-display` initial, followed by name and "Outlet console". The data needed to show a real logo already flows into this component — `settings` from `useAdminSettings()` carries `branding.logoImageId` and `logoUrl`, both surfaced by `GET /api/admin/settings` without backend work. The exact pattern exists already in `CustomerLayout.tsx`: resolve the URL, render `img` if present, else the initial tile. So the implementation is a surgical swap of one tile block, wrapped in a small reusable helper.

## Approach

Modify `AdminLayout.tsx` only. Add a header-tile renderer that resolves `settings?.branding` through `resolveImageUrl()` and conditionally renders either the logo `img` (36×36, `rounded-[var(--radius-field)]`, `object-cover`, brand background) or the existing initial-letter div. Because desktop sidebar, drawer, and top mobile header all render the same `railBody`, one change satisfies R5. The `img` gets an `onError` handler falling back to the initial letter (R6).

## Tasks

- [ ] **Task 1 — Reuse the image resolution and render the logo tile**
  1. Import `resolveImageUrl` from `../../lib/images` into `AdminLayout.tsx`.
  2. Add `logoSrc = resolveImageUrl(settings?.branding?.logoImageId ?? null, settings?.branding?.logoUrl)` near the existing `brand`/`initial` derivation.
  3. Replace the hardcoded initial `div` with a conditional: `logoSrc ? <img src={logoSrc} ... onError={clearLogo}> : <initial div unchanged>`. Keep `alt=""`, `h-9 w-9`, `rounded-[var(--radius-field)]`, `object-cover`, and the brand-colour background.
- [ ] **Task 2 — Verify correctness and ship**
  1. Run `npm run lint -w frontend` and the production build; confirm zero regressions.
  2. Visually verify in the browser (dev server, seeded demo account with/without logo, desktop + drawer widths): logo tile renders for branded outlets, initial tile unchanged otherwise, fallback on broken URL.
  3. Commit to `feature/console-header-logo`, push, and open a PR against `main`.

## Assumptions and risks

The settings payload includes the branding object (verified in `tenantController.js`). The staleTime of 30s means a just-uploaded logo may take up to 30s to appear in the rail until refetch — acceptable, since the Branding page itself previews the logo via its own draft state, and saving invalidates consumers on navigation.

## Validation

TypeScript/lint pass; production build succeeds; screenshots at 1280px and 480px widths showing the branded tile in both the sidebar and drawer; a broken-URL test confirming the initial fallback.
