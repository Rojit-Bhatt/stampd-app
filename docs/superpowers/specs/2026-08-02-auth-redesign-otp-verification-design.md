# Auth redesign: sign-in/sign-up pages + OTP verification

Date: 2026-08-02
Status: approved, not implemented

## Scope

Sub-project 2 of the original four-group request (landing carousel + review
QR generator already shipped as sub-project 1). This covers:

1. Redesigning the customer sign-in, customer sign-up, and staff sign-in
   pages in the landing's visual language.
2. Replacing email-link verification with a 6-digit OTP for `AdminAccount`
   and `CustomerAccount` — the two identity models this product actually
   self-registers or invites into. **Password reset stays a clicked link.**

Explicitly **out of scope**, staying exactly as they are:

- `components/customer/AuthView.tsx` — the inline claim-flow login/register.
  Tenant-branded via `--brand`, embedded inside the claim page, not a
  full-page marketing surface. Redesigning it in the landing's dark palette
  would fight its actual job.
- `frontend/src/routes/VerifyEmail.tsx` and the tenant-scoped
  `VerificationToken` model it backs — CLAUDE.md documents this as the
  legacy `business_admin`/`platform` path, superseded by the unified
  `AdminAccount` system. Not touched.
- `GlobalVerifyEmail.tsx` / `AdminVerifyEmail.tsx` (the `?token=` link
  landing pages) — kept alive, not deprecated. Any email already sent before
  this ships, or a user who digs up an old email, still has a working link.
  New sends carry a code instead; the link path simply stops being how
  anyone new arrives there.

The remaining two groups from the original request (UI improvements —
profile page, org switcher, notifications; dashboard charts) are separate
sub-projects with their own specs, not covered here.

## 1. OTP data model

`AdminVerificationToken` and `AccountVerificationToken` each gain two fields,
set only on `type: "email_verify"` records:

```js
code: { type: String, default: null },      // 6-digit, zero-padded
attempts: { type: Number, default: 0 }
```

`password_reset` records never set `code` — that flow's `tokenHash` lookup
path is untouched, byte-for-byte, per the earlier scope decision.

### Issuance

`issueToken(accountId, "email_verify")` in both `companyService.js` (admin)
and `customerAccountService.js` (customer) changes to:

1. Invalidate any existing unexpired, unused `email_verify` record for this
   account (`usedAt = new Date()`) — only one live code at a time, so an
   older email's code can never be a second valid answer once a newer one
   exists.
2. Generate `code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")`.
3. Create the record with `expiresAt = now + 10 minutes` (down from the
   current 24 hours — a code is meant to be typed right after it arrives,
   not clicked days later) and `attempts: 0`.
4. Still generate and store the existing hex `tokenHash` alongside `code` on
   the same record, so the old `GET .../verify-email?token=` path keeps
   working unmodified against records minted by the new code — one record,
   two ways in.
5. Email carries the code, not a link:

   ```
   Subject: Your Stampd verification code
   Your code is 482913. It expires in 10 minutes.
   ```

### Verification by code

New service functions `verifyAdminOtp({ email, code })` and
`verifyCustomerOtp({ email, code })`, sitting next to the existing
`verifyAdminEmail`/`verifyAccountEmail` (token-based) functions and sharing
their post-verification tail (mark `emailVerified`, sync memberships, and —
customer side only — `autoFulfillForAccount`):

- Look up the account by email, then the newest non-expired, unused
  `email_verify` record for it.
- No matching record, or expired → `400 { code: "OTP_EXPIRED" }`.
- `record.code !== code` → increment `attempts`, save. `attempts >= 5` on
  this increment → mark `usedAt` (burn the code) and respond
  `429 { code: "OTP_LOCKED" }`. Otherwise `400 { code: "OTP_INCORRECT" }`.
- Match → mark `usedAt`, verify the account, run the same post-verification
  tail the token path runs, return the same success shape that path returns.

Five wrong guesses burning the code (not just rate-limiting the endpoint) is
the actual defense against a 6-digit space being brute-forced inside its
10-minute window — `authLimiter`'s 20/15min/IP is a backstop underneath it,
not the primary guard.

### Routes

```
POST /api/customer-auth/verify-otp   { email, code }   authLimiter
POST /api/admin-auth/verify-otp      { email, code }   authLimiter
```

Added alongside the existing `GET .../verify-email?token=` routes, which
stay mounted and unchanged.

### Login on an unverified account

**Admin only.** Today `adminLogin` throws `403 EMAIL_NOT_VERIFIED` and stops
— this is the one login path that actually gates on verification.
`loginAccount` (customer) does **not**: checked directly against the running
code, an unverified customer signs in today exactly like a verified one.
Verification is deferred and enforced per-action instead (redeeming is
gated; earning, browsing, and signing in are not — see
`RedeemLanding.tsx`/`CustomerDashboard.tsx` below). That product decision
stays exactly as it is; this spec only changes *how* verification happens
once it's triggered, not *when*. So the behavior below is admin-side only:

1. Issue a fresh OTP (same `issueToken` call the resend path already makes —
   invalidating any stale one from account-creation time, which matters most
   for staff: an outlet admin invited days ago has a long-dead original
   code).
2. Respond `403 { code: "NEEDS_VERIFICATION" }` — a distinct code from
   today's `EMAIL_NOT_VERIFIED`, so the frontend can tell "show the
   verify-code card, a fresh code is already on its way" apart from any
   other 403 path. The email being verified is whatever the visitor just
   typed into the login form — no need to round-trip it in the response
   body.

The manual "resend" affordance (`resend-verification` / its admin
equivalent) stays exactly as-is for "the code didn't arrive" — this is
strictly an *addition* of an automatic first send, not a replacement of the
existing manual one.

## 2. Frontend: shared verify-code component

`frontend/src/components/shared/auth/VerifyCodeCard.tsx` — one component,
used from three places. Built on the free Motion "Clerk sign-in" reference's
`OTPInput`/`ResendButton` pattern:

- A visually-hidden real `<input inputMode="numeric" autoComplete="one-time-code" maxLength={6}>`
  overlaying six slot boxes that mirror its digits — `autoComplete="one-time-code"`
  is what lets a phone offer to autofill the code straight from the SMS/email
  banner, and it's also what makes a plain paste of "482913" fill all six
  slots at once rather than needing per-box focus juggling.
- Slot boxes styled per call site: `--lp-*` tokens on the public pages this
  spec redesigns. No hard-coded palette in the component itself — it takes
  its colors from whatever CSS custom properties are in scope, the same
  convention `CtaPill`/`Eyebrow` already follow on the landing.
- Wrong code: shake the slot row (guarded by `useMotion().pick`, per this
  codebase's reduced-motion convention — a still fallback, not just a
  shorter shake) and show the server's message inline.
- `OTP_LOCKED`: replace the slot row with "Too many tries — request a new
  code" and auto-focus the resend button.
- Resend: 30-second disabled countdown after each send, matching the
  reference. Calls the existing resend endpoint for that identity type.
- `size: "full" | "inline"` — `"full"` is the card-stack treatment used on
  `AdminLogin.tsx` (dark landing tokens, larger). `"inline"` is a compact
  variant (smaller slot boxes, no outer card chrome) that drops into an
  existing light-theme card or banner without looking like a different
  product bolted on.

Props: `email: string`, `verify: (code: string) => Promise<void>`,
`resend: () => Promise<void>`, `onVerified: () => void`, `size`. Each call
site supplies its own `verify`/`resend` bound to `/api/customer-auth/*` or
`/api/admin-auth/*` — the component itself knows nothing about which
identity type it's authenticating.

### Call sites

Four real call sites — the two customer-facing auth pages
(`GlobalCustomerLogin.tsx`, `GlobalCustomerRegister.tsx`) get **visual
redesign only** (§3) and no `VerifyCodeCard` integration, because customer
login and registration never block on verification (see above).

- **`AdminLogin.tsx`** (`size="full"`): catch `code === "NEEDS_VERIFICATION"`
  from the login call (replacing today's `EMAIL_NOT_VERIFIED` branch,
  including the `unverifiedEmail`/"Resend verification email" banner it
  currently renders — line 46 and the JSX block near the bottom of the
  file) and render `VerifyCodeCard` in place of the login form, matching the
  Clerk reference's card-stack motion (the form scales back and dims, the
  verify card slides up over it). `onVerified` re-submits the original
  credentials, completing the sign-in the admin was already mid-way through.
- **`CustomerDashboard.tsx`** (`size="inline"`): the existing unverified
  banner's "Resend" button (the `onClick` that currently posts to
  `resend-verification` and toasts) opens `VerifyCodeCard` inline within the
  same banner instead of just toasting. `onVerified` re-fetches the account
  query so the banner disappears without a page reload.
- **`CustomerProfilePanel.tsx`** (`size="inline"`): the "Email verification"
  card's "Resend verification email" button (`resendVerification`) does the
  same — swaps to `VerifyCodeCard` inline inside that card.
- **`RedeemLanding.tsx`** (`size="inline"`): the "Verify your email first"
  gate screen's button (today: resend + toast "check your inbox") swaps to
  `VerifyCodeCard` inline. `onVerified` here is the one place that matters
  most functionally — it lets the customer complete the redeem they were
  actually there for, in the same visit, instead of leaving to check email
  and losing the counter's redeem QR context.

All four reuse one component; none duplicate the OTP slot-row UI.

## 3. Page redesign

`GlobalCustomerLogin.tsx`, `GlobalCustomerRegister.tsx`, `AdminLogin.tsx`
move to a split layout adapted from 21st.dev's "Modern Animated Sign In"
(`@arunachalam/modern-animated-sign-in`), rebuilt in the landing's dark
tokens rather than its own blue tech-stack theme. Each page applies the
`landing-dark` class to `<html>` for its lifetime, the same pattern
`PlatformLanding.tsx` and `ReviewQrGenerator.tsx` already use — so these
pages read as a continuation of the marketing site the visitor just came
from, not a jarring hop to a different product skin.

**Left panel** (hidden below the `lg` breakpoint, matching the reference —
mobile gets the form alone, full-width):

- Ripple rings (the reference's `Ripple` component) in `--lp-green` at low
  opacity.
- `StampdLogo` centered, animated with a slow pulse/rotate — this is the
  "animated logo" placeholder called for. Reduced-motion drops the
  animation, keeps the mark static.
- Three to four small orbiting glyphs (`OrbitingCircles` from the
  reference), replacing its HTML/CSS/TypeScript tech-stack icons with
  loyalty-domain ones: a point/coin glyph, a QR-corner glyph, a receipt
  glyph. Simple inline SVGs matching `StampdLogo`'s hand-built style, not a
  new icon dependency.

**Right panel:**

- The reference's `BoxReveal` per-field stagger-in and spotlight
  mouse-follow input glow (`Input`'s radial-gradient-that-follows-the-cursor
  effect), re-colored to `--lp-green`.
- Submit button restyled as `CtaPill` (`tone="cream"`) — the same pill
  every landing CTA uses, so the button a visitor clicks to actually sign in
  looks like the same button that got them here from "Talk to us."
- Show/hide password toggle (from the reference) kept as-is — no existing
  Stampd pattern for this to conform to instead.
- All of it routed through `useMotion()`/`useReducedMotion()` — the
  reference's raw Motion usage isn't reduced-motion-aware by itself, and
  this codebase's rule is that nothing hand-rolls a spring outside that hook.

`AdminLogin.tsx` keeps its single "sign in" form — there is still no
self-serve staff registration, so no sign-up tab is added there. Only its
visual language and its `NEEDS_VERIFICATION` handling change.
`GlobalCustomerLogin.tsx`/`GlobalCustomerRegister.tsx` get the visual
treatment and nothing else — no OTP branch, no behavior change, per the
"keep deferred" decision above.

## 4. Testing

New `backend/tests/auth-otp.js`, added to `backend/package.json`'s test
chain (or it never runs). Covers, for both admin and customer:

- Register/create an unverified account → its `email_verify` record carries
  a 6-digit `code`.
- Correct code → `emailVerified: true`, and for the customer path,
  `autoFulfillForAccount` still fires (assert against a pending claim, the
  same way the existing link-based test presumably does).
- Wrong code → `400 OTP_INCORRECT`, `attempts` incremented.
- Five wrong codes → `429 OTP_LOCKED`, and the sixth attempt (even the
  correct code) is rejected — the code is burned, not just rate-limited.
- Expired code (mock `expiresAt` in the past) → `400 OTP_EXPIRED`.
- Old-style link (`GET .../verify-email?token=`) against a record that also
  carries a `code` still verifies successfully — the two paths don't
  interfere with each other on the same record.
- Admin login on an unverified account returns `403 NEEDS_VERIFICATION` (not
  the old `EMAIL_NOT_VERIFIED`) and a fresh `email_verify` record exists,
  invalidating whatever record existed before the login attempt. Customer
  login on an unverified account still returns `200` exactly as it does
  today — this is the regression check for the "keep deferred" decision.
- Password-reset records (`type: "password_reset"`) never carry a `code`,
  confirming that path is genuinely untouched.

Frontend: `npm run lint` plus manual browser verification of: the
`AdminLogin.tsx` card-stack transition (unverified login → verify → signed
in), the three inline `VerifyCodeCard` integrations
(`CustomerDashboard.tsx`, `CustomerProfilePanel.tsx`, `RedeemLanding.tsx`),
the resend countdown, autofill/paste-of-six-digits into the slot row, and
reduced-motion behavior on the left-panel animation and the wrong-code
shake.

## Risks

- **10-minute TTL is a real behavior change for staff.** An outlet admin who
  doesn't check email within 10 minutes of a login attempt needs to log in
  again (which reissues a code) rather than finding a still-valid one. This
  is the intended trade-off of moving to OTP at all, not an oversight.
- **Two verification records can coexist on the same account** at the
  moment of transition (an old 24-hour link-only record from before this
  ships, and a new code-bearing one from a fresh login/resend) — both are
  independently valid until their own `expiresAt`/`usedAt`, which is
  correct, just worth knowing before reading test output that shows more
  than one live record for an account mid-migration.
- **`crypto.randomInt` range is `[0, 1_000_000)`**, so `000000` is a
  reachable code — `padStart(6, "0")` must not be skipped or a code like
  `4829` would render as `4829__` instead of `004829`.
