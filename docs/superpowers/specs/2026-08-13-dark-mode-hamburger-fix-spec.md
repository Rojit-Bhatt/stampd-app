# Spec — Dark mode survives closing the mobile navigation drawer

**Date:** 2026-08-13 · **Author:** Manus AI
**Related files:** `frontend/src/hooks/useTheme.ts`, `frontend/src/components/admin/AdminLayout.tsx`, `frontend/src/components/ui/sheet.tsx`

## Problem

On mobile and tablet widths, in dark mode, opening the console's hamburger menu preserves the dark appearance, but closing the menu flips the entire app to the light theme. Re-opening the menu flips it back to dark. Desktop is unaffected.

## Root cause

The console's identity rail (`railBody` in `AdminLayout.tsx`) carries the theme toggle at its foot. On desktop the rail lives in a sticky `<aside>` that never unmounts; on tablet and phone the aside is hidden and the same `railBody` renders **inside the drawer** (`<SheetContent>`). The drawer is a custom Sheet built on Radix Dialog plus a `motion` `AnimatePresence`, so its content **unmounts when the drawer closes**.

The theme is driven by `useTheme()` — used only by `ThemeToggle` — which applies `.dark` to `<html>` in a `useLayoutEffect` whose **cleanup unconditionally removes `.dark`** on every unmount as well as every re-run. When the drawer closes on mobile, the only mounted `ThemeToggle` unmounts, its cleanup strips `.dark`, and the page instantly reads as light. Re-opening the drawer re-mounts the toggle and re-applies dark. Desktop never sees the bug because its rail never unmounts.

## Requirements

**R1.** On mobile/tablet, closing the hamburger drawer must not change the theme. Dark mode must persist across unlimited open/close cycles.
**R2.** Toggling the theme via the sun/moon button must still work as today — choice persisted to `localStorage`, applied immediately with no flash.
**R3.** Dark mode must still **not leak** into non-console routes: navigating to a customer or public route removes `.dark` from `<html>` exactly as it does today.
**R4.** The fix must cover all three console layouts that use `useTheme` (AdminLayout, CompanyLayout, PlatformLayout) with no per-layout changes.
**R5.** No visual, structural, or behavioural change anywhere else; the drawer animation, rail geometry, and reduced-motion behaviour are untouched.

## Non-requirements

This spec does not change the Sheet implementation, Radix usage, drawer animation, the theme toggle's icon semantics, token definitions, or the shared `theme_preference` key. The customer app and public landing never call `useTheme` and are unaffected.

## Acceptance criteria

1. In a browser at ≤1023px width with dark mode on, open and close the hamburger drawer ten times: the page remains dark throughout, verified by `.dark` staying on `<html>`.
2. Toggling dark→light with the sun/moon button on mobile flips the theme and persists across drawer open/close cycles.
3. Navigating from the console to a customer route (e.g., `/explore`) leaves `<html>` without `.dark`, exactly as before the fix.
4. TypeScript, lint, and the production build pass.
5. Desktop console dark mode behaviour is unchanged.

## Out of scope

Any other Sheet/Dialog theming quirks (e.g., the scrim tone during animation) remain out of scope unless verified as user-visible.
