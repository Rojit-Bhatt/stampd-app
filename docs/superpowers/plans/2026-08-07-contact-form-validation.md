# Contact Form Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the outlet admin console's Contact & Location form validation — email must be from a known major provider (rejecting things like `company@g.com`), phone must be exactly 10 digits (optionally prefixed with `+977`/`977`).

**Architecture:** Both checks live entirely in `AdminContact.tsx` as pure functions plus the two existing inline error expressions — no new files, no backend change (this field is outlet-displayed contact info, not an auth boundary).

**Tech Stack:** React + TS, plain regex/string logic (no new dependency).

## Global Constraints
- Frontend-only — matches what was reported (the form itself accepting bad input), and this field isn't validated server-side either way (not a security boundary).
- No new npm dependencies.
- No frontend test framework exists in this repo — verification is `npx tsc --noEmit` plus a manual browser check.

---

### Task 1: Email allowlist + 10-digit phone validation

**Files:**
- Modify: `frontend/src/routes/admin/AdminContact.tsx:35-36` (regex constants)
- Modify: `frontend/src/routes/admin/AdminContact.tsx:173-174` (error expressions)

**Interfaces:**
- Consumes: nothing from other tasks — standalone plan.
- Produces: nothing consumed elsewhere.

**Context:** `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepts any syntactically valid domain, including `g.com`. `PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/` accepts 7-20 digits in any shape. Fix: keep a format check for email, then also require the domain to match a small allowlist of common providers; phone strips a leading `+977`/`977` and any non-digit characters, then requires exactly 10 digits.

- [x] **Step 1: Replace the two regex constants with real validators**

Open `frontend/src/routes/admin/AdminContact.tsx`. Find:

```typescript
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;
```

Replace with:

```typescript
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];

function isValidEmail(value: string): boolean {
  if (!EMAIL_FORMAT_RE.test(value)) return false;
  const domain = value.split("@")[1]?.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function isValidPhone(value: string): boolean {
  const digitsOnly = value.replace(/[^0-9]/g, "").replace(/^977/, "");
  return /^[0-9]{10}$/.test(digitsOnly);
}
```

- [x] **Step 2: Update the two error expressions to use the new functions**

Find:

```typescript
  const phoneError = contact.phone && !PHONE_RE.test(contact.phone) ? "Enter a valid phone number." : "";
  const emailError = contact.email && !EMAIL_RE.test(contact.email) ? "Enter a valid email address." : "";
```

Replace with:

```typescript
  const phoneError = contact.phone && !isValidPhone(contact.phone) ? "Enter a valid 10-digit phone number." : "";
  const emailError = contact.email && !isValidEmail(contact.email) ? "Use a Gmail, Yahoo, Outlook, or other major provider address." : "";
```

- [x] **Step 3: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 4: Manually verify in a browser**

Start this worktree's own dev servers directly (not a shared preview tool that may be bound to a different checkout):

```bash
cd backend && MONGODB_URI= PORT=5001 npm run dev > /tmp/wt-backend.log 2>&1 &
cd frontend && npx vite --port 3010 > /tmp/wt-frontend.log 2>&1 &
```

Log into the admin console at `http://localhost:3010/admin-login` (`durbarmarg@coffesarowar.com` / `password`), go to Contact, and check:
- `company@g.com` in the Email field → shows the new error, does not save.
- `company@gmail.com` → no error.
- A 9-digit phone number → shows the new error.
- A 10-digit phone number, with and without a `+977` prefix → no error in both cases.

Stop both background servers when done.

- [x] **Step 5: Commit**

```bash
git add frontend/src/routes/admin/AdminContact.tsx
git commit -m "$(cat <<'EOF'
fix: contact form validates email domain and 10-digit phone

EMAIL_RE only checked format (company@g.com passed, since g.com is a
syntactically valid domain) and PHONE_RE accepted 7-20 digits in any
shape. Email now also checks the domain against an allowlist of major
providers; phone strips a +977/977 prefix and requires exactly 10
digits. Frontend-only — this field isn't validated server-side either
way, and isn't an auth boundary.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** the one spec item (email allowlist + 10-digit phone) is fully covered by Task 1.
- **Type consistency:** `isValidEmail`/`isValidPhone` both take `string`, return `boolean` — no signature mismatch with how they're used in the two error expressions.
- **No placeholders:** every step has literal code.
