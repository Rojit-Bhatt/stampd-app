# Staff Console Dark Mode — Design

**Date:** 2026-08-02
**Status:** Approved, ready for planning
**Roadmap source:** `2026-07-30-samparka-parity-roadmap-design.md`, sub-project 10

## What this covers, and what it doesn't

Sub-project 10 flagged one open question: whether the customer console is
included, since it's the surface with tenant-brand theming and therefore all
of the contrast risk. That question is answered here by scope, not by design
work: **the customer console is out.** This design wires the existing `.dark`
token block in `index.css` up to a real toggle for the three fixed-identity
consoles only — admin (outlet staff), platform (super-admin), and company
(owner) — none of which are tenant-themed, so there is no `lib/color.ts`
contrast risk to solve here. `lib/color.ts`, `scripts/verify-tenant-color.ts`,
and every customer-facing route/component are untouched.

## Mechanism

One hook, `frontend/src/hooks/useTheme.ts`, used by all three layouts. Three
things worth being deliberate about:

**Where the `.dark` class lives.** The brief specifies `document.documentElement`
— `<html>` — which is shared by the entire SPA, including the excluded
customer console and the always-dark public landing page. Applying it once
globally (e.g. from `App.tsx`) would leak dark mode into routes that were
explicitly scoped out. Instead, the hook applies (and — critically — removes)
the class from inside a `useLayoutEffect` whose cleanup runs on unmount. Since
only one of the three console layouts is ever mounted at a time (they're
mutually exclusive route subtrees) and no customer route ever calls the hook,
this means: dark mode is live exactly while a staff console is on screen, and
disappears the instant the user navigates to a customer or public route,
without any route-based CSS scoping or a second class name. It's a hook
lifecycle trick, not a new mechanism.

**Where the preference lives.** A single `localStorage` key,
`theme_preference` (`"light"` | `"dark"`), read by whichever console mounts
first. Toggling in the admin console and later opening the platform console
in the same browser remembers the choice — one preference across all staff
surfaces, matching how there's one person behind all of them.

**First load.** No stored preference falls back to
`window.matchMedia("(prefers-color-scheme: dark)")`, per the brief. No attempt
is made to prevent the one-frame flash between initial (light) render and the
effect applying `.dark` — avoiding that would mean a blocking script in
`index.html` reachable before any route decides whether it's a console route,
which is more machinery than a styling pass justifies.

## Toggle placement

A single `ThemeToggle` component (`components/shared/ThemeToggle.tsx`) wraps
the hook in a sun/moon icon button (lucide-react `Sun`/`Moon`, no custom SVG).
Each layout supplies its own `className` matching the button styling already
established next to it, rather than the component carrying opinions about
three different chrome styles:

- **`AdminLayout`** — sidebar footer, in the same row as `AccountMenu` (today:
  `<div className="mt-2 border-t ... pt-3"><AccountMenu ... /></div>`).
  Styled like the rail's other icon-only affordances (muted, hover surface).
- **`CompanyLayout`** — same placement and styling as Admin. The brief's
  phrasing groups Company with Platform under "header area," but Company's
  account-level control already lives in the sidebar footer identically to
  Admin (`<div className="mt-auto border-t ... pt-3"><AccountMenu ... /></div>`)
  — there's no header-area account control to match there. Placement follows
  the actual existing convention (sidebar footer) rather than the brief's
  shorthand grouping; noted here rather than silently deviating.
- **`PlatformLayout`** — header bar, next to the `AccountMenu` instance that
  already sits there (`<div className="flex-shrink-0"><AccountMenu ... /></div>`).
  Styled like the header's other icon buttons (the search trigger): fixed
  hex colours, not tokens — see below for why.

## The one real interaction hazard: PlatformLayout's header is deliberately NOT themed

`PlatformLayout.tsx`'s header carries an explicit comment: "Dark chrome, on
purpose: this console is not a tenant's and should never be mistaken for one.
... this one is a data desk." It's styled dark unconditionally, independent
of anything — that's the existing design, predating this project.

Today that's implemented as `bg-[var(--ink)] text-[#E9F0EC]`, plus several
sibling elements using literal hex (`text-[#8DA79A]`, `text-[#6E8578]`,
`bg-white/10`). The literal hexes were never a bug — they happen to equal the
`.dark` block's `--ink`/`--soft`/`--muted` values today, which is exactly what
"always dark, regardless of theme" looks like when there's no theme to be
independent of. But `bg-[var(--ink)]` is a **token reference**, and `--ink`
is the one token that inverts (light→dark text colour) between the two
themes. The instant `.dark` is wired up, toggling to dark mode flips the
header's background from dark-navy to near-white — while the sibling text
stays literally `#E9F0EC` (light) — producing light text on a light header:
the exact "unreadable" failure mode this pass exists to catch, and it would
ship in the one place already designed to be immune to the toggle.

**Fix:** replace `bg-[var(--ink)]` with the literal `bg-[#14201C]` (today's
`--ink` light-mode value). This isn't "hardcoding a colour that should be a
token" — it's the opposite: this header was already deliberately hardcoded
everywhere else, and the one remaining token reference was an oversight now
made visible by turning the toggle on. No other part of `PlatformLayout`
needs this treatment; the page body below the header (`bg-[var(--bg)]
text-[var(--ink)]`) is meant to flip with the theme like every other console
surface — only the fixed-dark header chrome is exempt.

## Inventory: every hardcoded colour in scope, and its disposition

Scope per the brief: `routes/admin/`, `routes/platform/` **excluding**
`routes/platform/landing/`, `routes/platform/legal/`, and
`routes/platform/reviewqr/` (see "Why the platform landing/legal/review-QR
pages are excluded" below), `routes/company/`, `components/admin/`,
`components/platform/`, `components/company/`, `components/ui/`,
`components/shared/`. Grepped for `bg-white`, hex literals, and Tailwind's
default gray/slate/zinc/neutral/blue/red/etc. palette classes.

### Fix: hardcoded value → token

| File | Line(s) | Before | After | Why |
|---|---|---|---|---|
| `components/platform/PlatformLayout.tsx` | 165 | `bg-[var(--ink)]` | `bg-[#14201C]` | Header must stay dark regardless of theme (see above) — token reference was the bug |
| `routes/admin/MenuManagement.tsx` | 181 | `background: menuEnabled ? "var(--brand)" : "#DDD2CB"` | `... : "var(--line)"` | Toggle-track "off" colour; `#DDD2CB` is a light warm-gray with no dark equivalent, `--line` already has one |
| `routes/admin/AdminContact.tsx` | 240 | `bg-gray-200` | `bg-[var(--surface-2)]` | Un-migrated Tailwind default gray on a day-hours toggle track; matches `ui/switch.tsx`'s own unchecked-track convention (`data-[state=unchecked]:bg-[var(--surface-2)]`) |
| `routes/platform/RegisterCompany.tsx` | 95 | `border-[#CBE4D6]` (pairs with `bg-[var(--ok-soft)]`) | `border-[var(--ok)]/30` | Literal mint border has no dark counterpart; `--ok` scaled to 30% opacity reproduces the same subtle-outline relationship in both themes (precedent: `ring-[var(--primary)]/25` already used in `ui/input.tsx`, `ui/select.tsx`) |
| `components/admin/MenuImportPreviewModal.tsx` | 58 | `border-[#CBE4D6]` (pairs with `bg-[var(--ok-soft)]`) | `border-[var(--ok)]/30` | Same pattern, same fix |
| `components/admin/MenuImportPreviewModal.tsx` | 77 | `border-[#EBDCAE]` (pairs with `bg-[var(--warn-soft)]`) | `border-[var(--warn)]/30` | Same pattern, warn variant |

### Fix: `bg-white` sitting under text/elements that DO respond to the toggle (real "unreadable" bugs)

These are cases where the box is hardcoded white but something inside or
around it (inherited text colour, or an explicit `var(--ink)`/`var(--muted)`
class) will turn light-coloured once `.dark` is live — producing light text
on a white box.

| File | Line(s) | Fix |
|---|---|---|
| `components/admin/SuspendedOverlay.tsx` | 16 | `bg-white` → `bg-[var(--surface)]`. The "Log out" button sets no explicit text colour, so it inherits the ambient `var(--ink)` from `body` — in dark mode that's light text, and the button would go invisible on its own hardcoded-white background. |
| `routes/platform/RegisterCompany.tsx` | 128 | `bg-white` → `bg-[var(--surface)]`. Same shape: the "Back to companies" `Link` has no explicit colour, inherits ambient ink. |
| `routes/platform/CompanyDetail.tsx` | 146 | `bg-white` → `bg-[var(--surface)]`. The suspend/reactivate button's text colour is explicitly `var(--ok)`/`var(--warn)` (not inherited ink, so not literally unreadable), but a stark white patch is the wrong read against a themed page — bringing it onto `--surface` keeps it consistent with every other card-level surface in the console. |
| `routes/platform/RegisterCompany.tsx` | 109 | `bg-white` → `bg-[var(--surface)]`. URL-copy row inside the `--ok-soft` success panel; same "stark white patch" reasoning as above, no literal unreadable-text risk since the URL text is explicitly `var(--primary-deep)`. |
| `routes/company/CompanyDashboard.tsx` | 150 | `bg-white` → `bg-[var(--surface)]`. "View subscription" pill inside a `--warn-soft` banner; text is explicitly `var(--warn)` (not an unreadable-text case), fixed for consistency with the surrounding themed banner. |

### Fix: "the always-white box" pattern — QR codes and customer-view previews

Four places intentionally show something that must **stay light regardless
of the admin's own theme choice**, but currently mix that fixed-white
intent with token-based text/children that would go the wrong colour once
`.dark` exists. This is the same shape of bug as the `PlatformLayout` header
above (a "must never themed" surface accidentally depends on a token that
does theme) but the fix differs: instead of one hardcoded background, these
need the surface **and every custom-property token used inside it** pinned,
because — unlike the header, which is a flat colour block — these boxes have
child elements written against `var(--ink)`/`var(--muted)`/etc. expecting
the light-mode values.

**QR display boxes** (`routes/admin/GenerateQr.tsx` line 168,
`routes/admin/RedeemPoints.tsx` line 72): a QR code needs a white background
for camera scan contrast — that's already correct and stays. But the same
box's "no active code" empty state renders `text-[var(--soft)]` (icon),
`text-[var(--ink)]` (label), `text-[var(--muted)]` (caption) — all of which
go light-on-white once dark mode is live. Fix: keep the box's own background
literal white, and pin `--ink`/`--muted`/`--soft` to their light-mode hex
values via an inline `style` object on the same wrapper, so everything
already written as `var(--ink)` etc. inside it keeps resolving to the light
value no matter what `<html>` is doing:

```tsx
style={{
  background: "#FFFFFF",
  borderColor: "#E4E9E6",
  ["--ink" as any]: "#14201C",
  ["--muted" as any]: "#5C6B64",
  ["--soft" as any]: "#8B9A93",
}}
```

The QR's own `fgColor="#14201C"` (already hardcoded dark ink, unrelated to
any token) needs no change — it was already correct for a background that's
always white.

**Customer-view live previews** (`routes/admin/Branding.tsx` line 225,
`routes/admin/AdminContact.tsx` line 359): both render a mockup of what the
*customer* sees on their (always-light, out-of-scope) dashboard — the
branding card and the contact-info card respectively. Currently `bg-white`
on the outer wrapper, `var(--ink)`/`var(--muted)`/`var(--soft)`/`var(--surface)`/
`var(--line)`/(`var(--primary)` in Branding's balance figure; `var(--bg)` in
AdminContact's social-icon circles) on everything inside. Once `.dark` ships,
these previews would render as a **dark mockup of a page that is never
dark** — not merely inaccurate, but the specific white-background,
light-ink-text combination that's unreadable. Same fix, larger override set
(only the tokens actually referenced inside each box):

- `Branding.tsx` preview: pin `--ink`, `--muted`, `--soft`, `--surface`,
  `--line`, `--primary` to their light-mode values.
- `AdminContact.tsx` preview: pin `--ink`, `--muted`, `--bg`, `--line`.

The nested Google-review mockup inside `AdminContact.tsx`'s preview
(`#f8f9fa`/`#e8eaed`/`#202124`/`#fbbc05`/`#5f6368`/`#1a73e8`) is already
100% literal hex with no token references — it was never going to move, and
needs no change. It's included here only so the inventory is visibly
complete, not because it's broken.

### Leave alone: colour is correct as-is

| File | Line(s) | What it is | Why it's fine |
|---|---|---|---|
| `components/admin/CampaignFormModal.tsx` | 114, 207 | `bg-white/20 text-white`, `color: "#fff"` | Sitting on a solid `var(--primary)` fill (a green pill/badge) — white-on-green stays legible in both themes since `--primary` is a mid-bright green in each (`#0FA968` light / `#34D399` dark) |
| `routes/admin/AdminCampaigns.tsx` | 89 | `color: c.isLive ? "#fff" : "var(--soft)"` on `background: var(--primary)`/`var(--surface-2)` | Same shape — white text only appears against the solid primary fill |
| `routes/admin/MenuManagement.tsx` | 365 | `color: i.isFeatured ? "#fff" : "var(--muted)"` on `background: var(--brand)`/`var(--bg)` | Same shape |
| `routes/admin/MenuManagement.tsx` | 186, `routes/admin/AdminContact.tsx` 245, `components/ui/switch.tsx` 24 | Toggle-knob `bg-white` | Decorative knob riding on a colour-token track (`var(--brand)`/`var(--line)` or `var(--primary)`/`var(--surface-2)`); a white circle reads fine against either track colour in either theme — same convention the already-wired `ui/switch.tsx` thumb uses today |
| `components/admin/AdminLayout.tsx` | 120, 158 | `brand = settings?.branding?.primaryColor \|\| "#0FA968"` (JS fallback), `style={{ background: brand, color: "#fff" }}` (logo tile) | The fallback is the outlet's *own* tenant colour default (unrelated to app theme, pre-existing); the tile always sets white text against an arbitrary brand fill by design — a pre-existing brand-contrast question, not something this pass introduces or is scoped to fix |
| `components/shared/StampdLogo.tsx` | 24, 25, 28, 39 | Fixed coin-logo colours (`#1F1B18`/`#C15D2C`/`#F3ECE2`) | CLAUDE.md is explicit: "Colors are fixed ... not tenant-themed: this is the platform's identity" — same reasoning extends to not theme-toggle-themed either; it's a wordmark, not UI chrome |
| `routes/admin/AdminOverview.tsx` | 83–84 | `CHART_EARNED_COLOR = "#A8632E"`, `CHART_REDEEMED_COLOR = "#1A6E99"` | **Flagged, not fixed** — see "Known gap" below |

### Known gap: chart series colours aren't dark-mode validated

`AdminOverview.tsx`'s own comment says these two colours were "validated for
chroma, CVD separation and contrast against a white card rather than picked
by eye." The chart card itself (`Panel`, line 123) is already fully
token-based (`bg-[var(--surface)]`) and correctly darkens. The two series
fills do not — and were never validated against a dark card, only a light
one. Nothing in the `.dark` token block is "a chart-safe categorical pair,"
so there's no existing token to swap them onto, and picking new ones without
the same chroma/CVD rigour that produced the current pair would be inventing
a design decision this pass isn't positioned to make (that's dataviz-skill
work, not a token audit). Both bars stay legible against the dark card —
`#A8632E` and `#1A6E99` are mid-tone, not near-black — so this isn't a "white
text on white" failure, just an unverified one. Left unchanged, flagged here
per the brief's instruction to flag rather than invent.

### Why the platform landing/legal/review-QR pages are excluded despite living under `routes/platform/`

`routes/platform/landing/*` (backs `PlatformLanding.tsx`, mounted at `/`),
`routes/platform/legal/*` (`/privacy`, `/terms`), and
`routes/platform/reviewqr/*` (backs `ReviewQrGenerator.tsx`, mounted at
`/review-qr`) share a directory prefix with the platform *console* but are
none of it: `App.tsx` mounts all three as standalone public routes, never
inside `PlatformLayout`, never behind `isPlatformAdmin`/login. They're
marketing/public-tool surfaces, not staff consoles — the same category the
brief excludes for the customer app. Functionally, they already carry their
own permanently-dark design system: `index.css`'s `.landing-dark` scope
(explicit comment: "MUST NOT be promoted to `:root` — every console in this
app is light, and inheriting a dark ink token would wreck all of them") with
its own `--lp-*` custom properties, entirely separate from `--bg`/`--ink`/etc.
Every hex literal grepped inside those three subtrees (`#14201C`, `#F3ECE2`,
`#0FA968`, Google-Maps-adjacent colours in `ReviewFlyer.tsx`, and so on) is
either a literal that already matches the always-dark landing palette or
belongs to `--lp-*`, not `:root`/`.dark` — so `.dark` on `<html>` has zero
effect there today and would have zero effect after this change either way.
No file under these three subtrees is touched.

`routes/AdminLogin.tsx` (top-level, not under `routes/admin/`) and
`routes/platform/PlatformLogin.tsx` are in scope despite one living outside
the brief's literal directory list — grepped and found to already be
entirely token-based already (no hardcoded colours), so no fix, but called
out here since both are genuine staff-facing entry points that stay reachable
after the toggle is set (logging out from a dark-mode admin console lands on
`AdminLogin` with `.dark` still applied via the persisted preference until
that page's own layout, which never calls `useTheme`, unmounts... except
`AdminLogin` isn't wrapped by any of the three console layouts either. See
"Login-page edge case" below.)

### Login-page edge case

`AdminLogin.tsx` and `PlatformLogin.tsx` are reachable without ever mounting
`AdminLayout`/`PlatformLayout`/`CompanyLayout` — they're the routes you land
on *before* auth succeeds, or after logging out. Because the `.dark` class is
only added/removed by the `useTheme()` hook instances living inside those
three layouts (see "Mechanism" above), a login page reached by direct
navigation or by logging out never toggles `.dark` on or off itself — it
simply inherits whatever state the class happens to be in from the last
console layout that mounted (dark, if the last thing that unmounted was a
dark-mode console; light, if the browser tab has never mounted one this
session). Both files are already fully token-based, so either state renders
correctly — this is called out as a known, accepted characteristic of the
mount-scoped design (not a bug to fix): a login page has no theme control of
its own and doesn't need one, since there's no `AccountMenu`-adjacent slot to
put a toggle in before the user has an account context.

## Implementation summary

- New: `frontend/src/hooks/useTheme.ts` — the hook described above.
- New: `frontend/src/components/shared/ThemeToggle.tsx` — sun/moon icon
  button, `useTheme()` internally, `className` prop for per-layout styling.
- Modified: `AdminLayout.tsx`, `CompanyLayout.tsx`, `PlatformLayout.tsx` —
  mount a `ThemeToggle` next to their existing `AccountMenu`; `PlatformLayout`
  additionally gets the `bg-[#14201C]` header fix.
- Modified: the eleven files in the inventory above with an actual colour
  fix (`MenuManagement.tsx`, `AdminContact.tsx`, `RegisterCompany.tsx`,
  `MenuImportPreviewModal.tsx` ×2 fixes, `SuspendedOverlay.tsx`,
  `CompanyDetail.tsx`, `CompanyDashboard.tsx`, `GenerateQr.tsx`,
  `RedeemPoints.tsx`, `Branding.tsx`).
- Untouched: everything under `components/customer/`, every customer-facing
  route, `lib/color.ts`, `scripts/verify-tenant-color.ts`, the platform
  landing/legal/review-QR subtrees, and every file the grep found clean
  (all of `components/ui/` except the already-correct `switch.tsx` thumb,
  all of `components/shared/` except the new `ThemeToggle.tsx`, and every
  admin/platform/company route not listed above).

## Testing

Pure frontend styling change — no backend surface, no new data model, no new
API. "Test" means:

- `npm run lint` (`tsc --noEmit`) clean after each task.
- Live verification: toggle dark mode from within an admin page, a platform
  page, and a company page; screenshot each in both themes; specifically
  check the four "always-white box" fixes (QR codes on Generate/Redeem, the
  two customer-view previews) render correctly in dark mode, and that
  `PlatformLayout`'s header stays dark when the rest of the console goes
  light-to-dark (and vice versa — stays dark when the console is toggled
  *to* light, proving the header truly doesn't respond to the toggle either
  way).
- No automated frontend test suite exists for visual regressions in this
  codebase (`npm run lint` is the sole frontend check per `CLAUDE.md`), so no
  new test files are added — matching how the existing design-system passes
  (toast/dialog restyle, admin UI polish batch) verified visually rather than
  by new assertions.

## Out of scope

The customer console, `lib/color.ts`, tenant-brand dark-mode contrast
(`scripts/verify-tenant-color.ts`), the platform landing page and its
`--lp-*` system, `/privacy`/`/terms`, `/review-qr`, and picking new
chroma/CVD-validated chart colours for `AdminOverview.tsx`'s dark-mode bars
(flagged above, not solved). No new design tokens are introduced — every fix
above resolves to a token, an opacity-scaled token, or a pinned literal that
already exists as some token's current value.
