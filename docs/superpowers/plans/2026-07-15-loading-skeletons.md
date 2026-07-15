# Epic E3: Loading Skeletons Implementation Plan

> **For agentic workers:** Executed inline, autonomously, per explicit user authorization — no per-task approval checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every plain "Loading…" text / bare spinner shown while a screen's data is in flight, across all 3 apps, with a skeleton shaped like that screen's real content.

**Architecture:** One retrofitted base primitive (`components/ui/skeleton.tsx`, already present but unused, recolored to the Stampd `--line` token) composed inline, screen-by-screen, into JSX that mirrors each screen's actual wrapper structure (same grid-cols/flex/border classes as the real content) — not a shared generic row/table component.

**Tech Stack:** React 19/TS, Tailwind v4, existing shadcn `Skeleton` primitive.

## Global Constraints

- Skeleton color: `bg-[var(--line)]` with `animate-pulse` (matches the neutral divider tone used everywhere else in the retrofit) — not the shadcn default `bg-primary/10`.
- Excluded entirely: `AdminLogin.tsx`, `PlatformLogin.tsx`, `GenerateQr.tsx` (button/mutation-pending states, not data-fetch loading) and `AdminGuard.tsx`/`CustomerLayout.tsx`/`PlatformLayout.tsx` (full-screen auth-gate spinners, explicitly kept per the locked scope decision).
- Each skeleton renders a fixed count (3-5) of placeholder rows/cards — no need to match real data length.
- No test framework exists for the frontend; verification is `tsc --noEmit` + browser walkthrough, consistent with every prior frontend-only task in this project.

---

### Task 1: Retrofit the base Skeleton primitive

**Files:**
- Modify: `frontend/src/components/ui/skeleton.tsx`

**Interfaces:**
- Produces: `<Skeleton className?: string />` — a `<div>` with `animate-pulse rounded-md bg-[var(--line)]` plus any additional classes passed in. Every later task imports this from `../../components/ui/skeleton` (or `../ui/skeleton` depending on file depth).

- [ ] **Step 1: Change the fill color**

Replace the full contents of `frontend/src/components/ui/skeleton.tsx`:

```tsx
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-[var(--line)]", className)} {...props} />;
}

export { Skeleton };
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ui/skeleton.tsx
git commit -m "feat(ui): retrofit Skeleton primitive to Stampd tokens"
```

---

### Task 2: Form-style pages (single-column and two-column-with-preview)

**Files:**
- Modify: `frontend/src/components/shared/AccountSettingsForm.tsx:30-32`
- Modify: `frontend/src/routes/admin/StampProgram.tsx:14-16`
- Modify: `frontend/src/routes/admin/AdminContact.tsx:41-43`
- Modify: `frontend/src/routes/admin/Branding.tsx:34-36`
- Modify: `frontend/src/routes/platform/PlatformContact.tsx:32-34`

**Interfaces:**
- Consumes: `Skeleton` from Task 1.

- [ ] **Step 1: `AccountSettingsForm.tsx`**

Replace:
```tsx
  if (isLoading || !account) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }
```
with:
```tsx
  if (isLoading || !account) {
    return (
      <div className="flex max-w-[480px] flex-col gap-6">
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <Skeleton className="mb-3 h-4 w-20" />
          <Skeleton className="mb-1.5 h-3 w-16" />
          <Skeleton className="mb-3 h-11 w-full rounded-[11px]" />
          <Skeleton className="mb-3 h-3 w-40" />
          <Skeleton className="h-10 w-28 rounded-[13px]" />
        </div>
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <Skeleton className="mb-3 h-4 w-32" />
          <Skeleton className="mb-1.5 h-3 w-24" />
          <Skeleton className="mb-3 h-11 w-full rounded-[11px]" />
          <Skeleton className="mb-1.5 h-3 w-24" />
          <Skeleton className="mb-3 h-11 w-full rounded-[11px]" />
          <Skeleton className="h-10 w-32 rounded-[13px]" />
        </div>
      </div>
    );
  }
```
Add the import at the top: `import { Skeleton } from "../ui/skeleton";`

- [ ] **Step 2: `StampProgram.tsx`**

Replace:
```tsx
  if (isLoading || !form) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }
```
with:
```tsx
  if (isLoading || !form) {
    return (
      <div className="max-w-[620px]">
        <Skeleton className="mb-2 h-7 w-56" />
        <Skeleton className="mb-6 h-4 w-72" />
        <div className="flex flex-col gap-6 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <div>
            <Skeleton className="mb-2.5 h-3.5 w-52" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="border-t border-[var(--line)] pt-5">
            <Skeleton className="mb-1.5 h-3.5 w-28" />
            <Skeleton className="h-11 w-full rounded-[11px]" />
          </div>
          <div>
            <Skeleton className="mb-1.5 h-3.5 w-36" />
            <Skeleton className="h-16 w-full rounded-[11px]" />
          </div>
          <div className="border-t border-[var(--line)] pt-5">
            <Skeleton className="mb-1.5 h-3.5 w-44" />
            <Skeleton className="h-11 w-24 rounded-[11px]" />
          </div>
          <Skeleton className="h-11 w-full rounded-[13px]" />
        </div>
      </div>
    );
  }
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 3: `AdminContact.tsx`**

Replace:
```tsx
  if (isLoading || !contact) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }
```
with:
```tsx
  if (isLoading || !contact) {
    return (
      <div>
        <Skeleton className="mb-2 h-7 w-40" />
        <Skeleton className="mb-6 h-4 w-96" />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-1.5 h-3.5 w-20" />
                <Skeleton className="h-11 w-full rounded-[11px]" />
              </div>
            ))}
            <Skeleton className="h-16 w-full rounded-[11px]" />
            <Skeleton className="h-11 w-full rounded-[13px]" />
          </div>
          <Skeleton className="h-[280px] w-full rounded-[24px]" />
        </div>
      </div>
    );
  }
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 4: `Branding.tsx`**

Replace:
```tsx
  if (isLoading || !brand) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }
```
with:
```tsx
  if (isLoading || !brand) {
    return (
      <div>
        <Skeleton className="mb-2 h-7 w-36" />
        <Skeleton className="mb-6 h-4 w-96" />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-28" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-16" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
            <div>
              <Skeleton className="mb-2 h-3.5 w-24" />
              <div className="flex flex-wrap gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-10 rounded-[12px]" />
                ))}
              </div>
            </div>
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-20" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-24" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
            <Skeleton className="h-11 w-full rounded-[13px]" />
          </div>
          <Skeleton className="h-[280px] w-full rounded-[28px]" />
        </div>
      </div>
    );
  }
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 5: `PlatformContact.tsx`**

Replace:
```tsx
  if (isLoading || !contact) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }
```
with:
```tsx
  if (isLoading || !contact) {
    return (
      <div>
        <Skeleton className="mb-2 h-7 w-32" />
        <Skeleton className="mb-6 h-4 w-80" />
        <div className="flex max-w-[560px] flex-col gap-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-1.5 h-3.5 w-24" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
          ))}
          <Skeleton className="h-12 w-full rounded-[13px]" />
        </div>
      </div>
    );
  }
```
Add the import: `import { Skeleton } from "../../hooks/../components/ui/skeleton";` — **note:** use the correct relative path for this file's depth, which is `../../components/ui/skeleton` (same depth as `AdminContact.tsx`, both under `routes/<subdir>/`).

- [ ] **Step 6: Typecheck**

Run: `npm run lint` (repo root)
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/shared/AccountSettingsForm.tsx frontend/src/routes/admin/StampProgram.tsx frontend/src/routes/admin/AdminContact.tsx frontend/src/routes/admin/Branding.tsx frontend/src/routes/platform/PlatformContact.tsx
git commit -m "feat(fe): content-shaped loading skeletons for account/contact/branding/program forms"
```

---

### Task 3: List/table-style pages

**Files:**
- Modify: `frontend/src/routes/admin/AdminCustomers.tsx:47,50-57` (insert skeleton rows)
- Modify: `frontend/src/routes/platform/Businesses.tsx:50,66,80-84` (insert skeleton rows + stat skeletons)
- Modify: `frontend/src/routes/admin/AdminEvents.tsx:160-161`
- Modify: `frontend/src/routes/admin/MenuManagement.tsx:208-209`
- Modify: `frontend/src/routes/CustomerMenu.tsx:19-22`

**Interfaces:**
- Consumes: `Skeleton` from Task 1.

- [ ] **Step 1: `AdminCustomers.tsx`** — table-grid rows matching `grid-cols-[2fr_1fr_1fr_1fr_1fr]`

Replace the header-count line:
```tsx
        {isLoading ? "Loading…" : `${customers.length} member${customers.length === 1 ? "" : "s"} of ${settings?.name ?? "your business"}`}
```
with:
```tsx
        {isLoading ? <Skeleton className="inline-block h-4 w-40 align-middle" /> : `${customers.length} member${customers.length === 1 ? "" : "s"} of ${settings?.name ?? "your business"}`}
```

Replace:
```tsx
        {customers.length === 0 && !isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">No customers yet.</div>
        ) : (
```
with:
```tsx
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
              <span className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
                <span className="flex-1">
                  <Skeleton className="mb-1.5 h-3.5 w-24" />
                  <Skeleton className="h-3 w-32" />
                </span>
              </span>
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-3.5 w-8" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))
        ) : customers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">No customers yet.</div>
        ) : (
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 2: `Businesses.tsx`** — 4 stat cards + table-grid rows

Replace:
```tsx
            {isLoading ? "Loading…" : `${businesses.length} onboarded · ${active} active`}
```
with:
```tsx
            {isLoading ? <Skeleton className="inline-block h-4 w-36 align-middle" /> : `${businesses.length} onboarded · ${active} active`}
```

Replace:
```tsx
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-1.5 text-[13px] text-[var(--muted)]">{s.label}</div>
            <div className="font-display text-[26px] font-extrabold">{s.val}</div>
          </div>
        ))}
      </div>
```
with:
```tsx
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-1.5 text-[13px] text-[var(--muted)]">{s.label}</div>
            {isLoading ? (
              <Skeleton className="h-[26px] w-10" />
            ) : (
              <div className="font-display text-[26px] font-extrabold">{s.val}</div>
            )}
          </div>
        ))}
      </div>
```

Replace:
```tsx
        {businesses.length === 0 && !isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">
            No businesses yet. Onboard your first.
          </div>
        ) : (
```
with:
```tsx
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
              <span className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 flex-shrink-0 rounded-[10px]" />
                <span className="flex-1">
                  <Skeleton className="mb-1.5 h-3.5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </span>
              </span>
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-3.5 w-8" />
              <Skeleton className="h-3.5 w-8" />
              <Skeleton className="h-3.5 w-8" />
            </div>
          ))
        ) : businesses.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">
            No businesses yet. Onboard your first.
          </div>
        ) : (
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 3: `AdminEvents.tsx`** — flex list rows

Replace:
```tsx
        {isLoading ? (
          <div className="p-5 text-sm text-[var(--muted)]">Loading…</div>
        ) : events.length === 0 ? (
```
with:
```tsx
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <Skeleton className="mb-1.5 h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-8 w-8 rounded-[9px]" />
              <Skeleton className="h-8 w-8 rounded-[9px]" />
            </div>
          ))
        ) : events.length === 0 ? (
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 4: `MenuManagement.tsx`** — flex list rows, grouped, so skeleton skips the category-heading structure and just shows flat rows

Replace:
```tsx
        {isLoading ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : items.length === 0 ? (
```
with:
```tsx
        {isLoading ? (
          <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <Skeleton className="mb-1.5 h-3.5 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-3.5 w-10" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 5: `CustomerMenu.tsx`** — replace the centered spinner with flat skeleton rows

Replace:
```tsx
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
        </div>
      ) : !menuEnabled ? (
```
with:
```tsx
      {isLoading ? (
        <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <Skeleton className="mb-1.5 h-3.5 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-3.5 w-10" />
            </div>
          ))}
        </div>
      ) : !menuEnabled ? (
```
Add the import: `import { Skeleton } from "../components/ui/skeleton";` (note: `CustomerMenu.tsx` is one level shallower than the admin/platform route files).

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/admin/AdminCustomers.tsx frontend/src/routes/platform/Businesses.tsx frontend/src/routes/admin/AdminEvents.tsx frontend/src/routes/admin/MenuManagement.tsx frontend/src/routes/CustomerMenu.tsx
git commit -m "feat(fe): content-shaped loading skeletons for list/table screens"
```

---

### Task 4: Detail/stat pages + customer wallet/dashboard

**Files:**
- Modify: `frontend/src/routes/platform/BusinessDetail.tsx:33-35`
- Modify: `frontend/src/routes/admin/AdminReportsSummary.tsx:99-101`
- Modify: `frontend/src/routes/CustomerWallet.tsx:22-25`
- Modify: `frontend/src/routes/CustomerDashboard.tsx` (the `cardLoading` readout)

**Interfaces:**
- Consumes: `Skeleton` from Task 1.

- [ ] **Step 1: `BusinessDetail.tsx`**

Replace:
```tsx
  if (isLoading || !business) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }
```
with:
```tsx
  if (isLoading || !business) {
    return (
      <div>
        <Skeleton className="mb-4 h-4 w-24" />
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Skeleton className="h-[60px] w-[60px] rounded-[16px]" />
          <div className="flex-1">
            <Skeleton className="mb-1.5 h-7 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-11 w-24 rounded-[12px]" />
          <Skeleton className="h-11 w-36 rounded-[12px]" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
              <Skeleton className="mb-1.5 h-3.5 w-20" />
              <Skeleton className="h-6 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 2: `AdminReportsSummary.tsx`**

Replace:
```tsx
            <div className="font-display text-[26px] font-extrabold leading-none">
              {isLoading ? "…" : c.val}
            </div>
```
with:
```tsx
            {isLoading ? (
              <Skeleton className="h-[26px] w-12" />
            ) : (
              <div className="font-display text-[26px] font-extrabold leading-none">{c.val}</div>
            )}
```
Add the import: `import { Skeleton } from "../../components/ui/skeleton";`

- [ ] **Step 3: `CustomerWallet.tsx`** — replace the centered spinner with voucher-card-shaped skeletons

Replace:
```tsx
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
        </div>
      ) : error ? (
```
with:
```tsx
      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-[20px] border border-[var(--line)]">
              <div className="p-4">
                <Skeleton className="mb-3 h-6 w-28" />
                <Skeleton className="h-[52px] w-full rounded-[12px]" />
              </div>
              <div className="flex justify-between px-4 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
```
Add the import: `import { Skeleton } from "../components/ui/skeleton";`

- [ ] **Step 4: `CustomerDashboard.tsx`** — the reward-card numeric readout

This sits on a colored brand-gradient background, so a semi-transparent white block (matching the existing `bg-white/20`/`bg-white/15` treatment already used on this card family) reads better than the neutral `--line` skeleton — no import needed, inline only.

Replace:
```tsx
            <div className="font-display text-2xl font-extrabold leading-none">
              {cardLoading ? "—" : `${stampsEarned} of ${required}`}
            </div>
```
with:
```tsx
            <div className="font-display text-2xl font-extrabold leading-none">
              {cardLoading ? (
                <span className="inline-block h-6 w-20 animate-pulse rounded bg-white/25 align-middle" />
              ) : (
                `${stampsEarned} of ${required}`
              )}
            </div>
```

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/platform/BusinessDetail.tsx frontend/src/routes/admin/AdminReportsSummary.tsx frontend/src/routes/CustomerWallet.tsx frontend/src/routes/CustomerDashboard.tsx
git commit -m "feat(fe): content-shaped loading skeletons for detail/stat/wallet/dashboard screens"
```

---

### Task 5: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Browser walkthrough**

For each of the 12 in-scope screens, throttle or catch the loading window (React Query's default `staleTime`/cache means a hard reload is usually needed to see the loading state) and confirm the skeleton renders in the right shape, then resolves to real content with no layout jump:
customer Menu, customer Wallet, customer Dashboard reward number; admin Contact, Branding, Stamp program, Customers, Events, Menu management, Reports summary, Settings (`AccountSettingsForm`); platform Businesses, Business detail, Contact, Settings.

- [ ] **Step 3: Report**

Summarize pass/fail. If everything passes, this epic is ready for the finishing-a-development-branch flow (merge locally per the established pattern this session, since no push was requested).
