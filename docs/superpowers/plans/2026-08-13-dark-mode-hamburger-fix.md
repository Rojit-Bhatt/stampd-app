# Plan — Dark mode survives closing the mobile navigation drawer

**Date:** 2026-08-13 · **Author:** Manus AI · **Spec:** `docs/superpowers/specs/2026-08-13-dark-mode-hamburger-fix-spec.md`
**Branch:** `feature/dark-mode-drawer-persistence` · **Effort estimate:** ~20 min

## Context and diagnosis

Confirmed root cause (see spec): `useTheme`'s effect cleanup unconditionally removes `.dark` on unmount, and on tablet/phone the only `ThemeToggle` instance lives inside the drawer body that unmounts when the drawer closes. The effect's current design treats *every* unmount as "leaving the console," but the drawer closing is a local, ephemeral unmount that must not hand the theme back to light.

## Approach

Edit `useTheme.ts` only: make the cleanup consult the **persisted preference** rather than a blanket removal. The stored `theme_preference` key is the source of truth for what the user actually wants, and it survives ephemeral unmounts. The effect body keeps applying the class synchronously (no flash), and cleanup now removes `.dark` **only when the stored preference is not dark** — preserving R3 because the console's own toggle (or absence of a stored pref) is what decides the page's theme; when the user genuinely leaves the console, the shared key still holds their preference, which is the correct state for the next console they visit. This matches how the rest of the app treats the shared key ("one person is behind all of them").

A subtle case: no stored preference + OS dark. On unmount the cleanup must not strip dark while the OS still prefers it — cleanup falls back to `systemPrefersDark()` in the same way the initializer does, so the class reflects "what dark mode would be on fresh mount" rather than "whatever was last painted."

No changes to `AdminLayout.tsx`, `sheet.tsx`, or any other file — the fix is property-based and self-enforcing, so the three console layouts inherit it automatically.

## Tasks

- [ ] **Task 1 — Rework the cleanup rule in `useTheme.ts`**
  1. Add a `useRef` capturing the current `theme` (the effect's `useLayoutEffect` runs before paint, so a ref read in cleanup reflects the theme that was active).
  2. Change cleanup to: remove `.dark` only when the ref-held theme is `light` OR (no stored pref and system does not prefer dark) — i.e., mirror the initializer's fallback logic.
  3. Keep the effect body untouched (apply class synchronously, no flash).
- [ ] **Task 2 — Verify and ship**
  1. Lint + TypeScript + production build clean.
  2. Reproduce in the browser at mobile width: dark mode persists across drawer open/close cycles (`.dark` on `<html>` before/after); toggle still works and persists; desktop unaffected; navigate to a public route and confirm `.dark` absent.
  3. Commit to `feature/dark-mode-drawer-persistence`, push, open PR against `main`.

## Assumptions and risks

The shared `theme_preference` key semantics are intentional (one person behind all three consoles); the fix leans on that documented contract. Risk: if a user visits a dark-preferred console without a stored pref, `localStorage` reads null — initializer and cleanup both fall back to the OS query, so behaviour is consistent across mount/unmount.

## Validation

Programmatic checks at ≤1023px and ≥1280px: `.dark` on `<html>` across 10 drawer cycles, post-toggle persistence, and absence on public routes; typecheck/lint/build green.
