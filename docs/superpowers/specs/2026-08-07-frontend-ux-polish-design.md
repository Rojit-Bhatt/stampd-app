# Group C — UX polish (optimistic updates, dark mode, sticky navbar, landing nav)

## 1. Navbar not fixed while scrolling (app-wide, confirmed live in browser)
**Root cause**: `index.css`'s global `html`/`body` rule sets `overflow-x: hidden` as an anti-pinch-zoom-misalignment backstop. Per CSS spec, when only one axis is set to `hidden`, the browser auto-promotes the other axis's `visible` to `auto` — so both `html` and `body` silently become independent scroll containers. This breaks `position: sticky`/`fixed` everywhere: verified in-browser that the outlet admin console's mobile header (`AdminLayout.tsx`, `sticky top-0`) scrolls away with the page instead of pinning.

This exact bug and mechanism was already diagnosed once and fixed — but scoped only to the landing page (`index.css` `html.landing-dark` override to `overflow-x: clip`, which clips the same overflow without establishing a new scroll container). The fix comment explicitly says "scoped to the landing... rest of the app is built on the original rule" — i.e. this was a known, deliberately deferred gap.

**Fix**: change the global `html`/`body` rule from `overflow-x: hidden` to `overflow-x: clip`. Remove the now-redundant `html.landing-dark` duplicate override (keep the landing-only `scroll-padding-top`/`scroll-behavior` rules, which are unrelated). Update the stale comment at `index.css:297` ("no console has a fixed header" — false, `AdminLayout` and likely `CompanyLayout`/`PlatformLayout` do). One 2-line CSS change fixes sticky/fixed positioning app-wide.

## 2. Featured/Show toggle has ~1s UX delay
**Root cause confirmed**: no optimistic update.
- `MenuManagement.tsx`'s `patchItem` mutation (toggles `isFeatured`) — waits for the round trip, then invalidates `["adminMenu"]`.
- `AdminRewards.tsx`'s `update` mutation (toggles `isActive`, the Hide/Show button) — same pattern.

**Fix**: add React Query optimistic updates to both — `onMutate`: cancel in-flight queries for the relevant key, snapshot previous cache, write the toggled value into cache immediately; `onError`: roll back to the snapshot and toast the error; `onSettled`: invalidate to reconcile with the server. Toggle appears instant; a real backend failure reverts visibly with an error toast (per the user's stated requirement — "if error occurs at backend handle it accordingly").

## 3. Dark-mode color distortion in mobile hamburger menu
**Root cause confirmed**: `components/ui/sheet.tsx` (shared by all three staff console mobile nav drawers — outlet admin, company, platform) references `--ring` and `--secondary` (via `ring-ring`, `bg-secondary`, `ring-offset-background` on `SheetClose`) — neither is defined anywhere in `index.css`'s token set (only Stampd's own `--primary`/`--surface`/etc. exist). Tailwind falls back to its own default palette for the undefined tokens, which clashes visibly against the app's real (especially dark-mode) palette on the sheet's close button.

**Fix**: define `--ring` and `--secondary` in `index.css`'s `:root` and `.dark` blocks, mapped to real Stampd tokens (e.g. `--ring: var(--primary)`, `--secondary: var(--surface-2)`). Single definition fixes all three consoles' mobile menus (shared component).

Note: user only directly observed this on the outlet admin console; since the root cause is a shared component/shared missing tokens, the fix is inherently app-wide — verify company and platform console mobile menus too during implementation.

## 4. Landing page nav (Services/Pricing/FAQ) doesn't work from `/review-qr`
**Root cause confirmed**: `NAV_LINKS` (`routes/platform/landing/data.ts`) mixes anchor links (`{kind:"anchor", href:"#services"}`) with a real route (`{kind:"route", to:"/review-qr"}`). `NavLinkItem` renders anchors as plain `<a href="#services">`. This works fine when already on `/`, but when the user is on `/review-qr` (itself using the shared `LandingNav`), clicking an anchor just rewrites the hash on the current path — there's no `#services` element on `/review-qr`, so nothing happens; it doesn't navigate home first.

**Fix**: in `NavLinkItem`, when rendering an anchor link, check `useLocation().pathname`. If not `/`, render as a `Link` to `/${href}` (react-router navigates, landing page's own scroll-on-mount-if-hash effect — add one if it doesn't exist — then scrolls to the section). If already on `/`, keep the plain `<a href="#...">` (native same-page anchor scroll, already correct there).

## Testing
- Manual (browser, mobile + desktop, both consoles applicable): scroll a long outlet-admin page and confirm header stays pinned; toggle Featured/Show and confirm instant UI update with a simulated backend error to confirm rollback+toast; open the mobile hamburger in dark mode across all 3 consoles and confirm no stray colors; click Services/Pricing/FAQ from `/review-qr` and confirm it lands on the section.
