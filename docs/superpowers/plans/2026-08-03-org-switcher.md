# Org Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a company owner who has entered one of their outlets switch to a different outlet, or return to the company dashboard, without a browser back-navigation round trip.

**Architecture:** One new frontend component, `OrgSwitcher.tsx`, rendered in `AdminLayout.tsx`'s topbar only when a `company_session` also exists in localStorage (proving the signed-in admin is a company owner passing through, not a genuine outlet admin). It reuses the existing `POST /api/company/enter-outlet` and `GET /api/company/outlets` calls `CompanyDashboard.tsx` already makes — no backend changes.

**Tech Stack:** React 19 + TS, TanStack Query, the existing `components/ui/dropdown-menu` primitive.

**Spec:** `docs/superpowers/specs/2026-08-03-org-switcher-design.md`

## Global Constraints

- **No backend changes.** `POST /api/company/enter-outlet` and `GET /api/company/outlets` already exist, are already `verifyCompanySession`-scoped, and are not touched.
- **Detection is a localStorage existence read, not an API call**: `localStorage.getItem("company_session")` present ⇒ render the switcher. A genuine `outlet_admin` never has this key.
- **`company_info`** (localStorage, JSON: `{ slug: string; name: string }`) is the source for the trigger label — read directly, not through `CompanyAuthContext` (that context's provider is not mounted inside `AdminLayout`'s route tree).
- Frontend has no test runner. Verification is `npm run lint` (`tsc --noEmit`) plus manual browser checks.
- `MONGODB_URI="" npm run dev -w backend` (not plain `npm run dev`) for local verification — `backend/.env` points at an unreachable Atlas cluster.

---

### Task 1: `OrgSwitcher` component and `AdminLayout` integration

**Files:**
- Create: `frontend/src/components/admin/OrgSwitcher.tsx`
- Modify: `frontend/src/components/admin/AdminLayout.tsx:23-26` (import), `:252-263` (topbar JSX)

**Interfaces:**
- Consumes: `apiRequest` from `frontend/src/lib/api`; `tenantPath` from `frontend/src/lib/tenantPath`; `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuLabel`/`DropdownMenuSeparator` from `frontend/src/components/ui/dropdown-menu`.
- Produces: `OrgSwitcher()` — no props, renders `null` when there is no `company_session`, so the call site never needs to branch.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/admin/OrgSwitcher.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Building2, ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { tenantPath } from "../../lib/tenantPath";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";

interface Outlet {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
}

interface CompanyInfo {
  slug: string;
  name: string;
}

const readCompanyInfo = (): CompanyInfo | null => {
  try {
    const raw = localStorage.getItem("company_info");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Renders only when the signed-in admin is a company owner who used
 * enter-outlet to drop into this console — enter-outlet never clears
 * company_session, it only adds a tenant token alongside it, so that key's
 * presence is exactly the "this is an owner passing through" signal. A
 * genuine outlet_admin has no company relationship and never has this key.
 */
export function OrgSwitcher() {
  const navigate = useNavigate();
  const { outletSlug } = useParams();
  const companyInfo = readCompanyInfo();
  const hasCompanySession = Boolean(localStorage.getItem("company_session"));

  const { data: outlets = [] } = useQuery<Outlet[]>({
    queryKey: ["companyOutlets"],
    enabled: hasCompanySession,
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; outlets: Outlet[] }>(
        "/api/company/outlets",
        { role: "company" },
      );
      return res.outlets;
    },
  });

  if (!hasCompanySession || !companyInfo) return null;

  const active = outlets.filter((o) => o.status !== "archived");

  const enterOutlet = async (outlet: Outlet) => {
    try {
      const res = await apiRequest<{ token: string; user: any; companySlug: string; outletSlug: string }>(
        "/api/company/enter-outlet",
        { method: "POST", role: "company", body: { organizationId: outlet.id } },
      );
      localStorage.setItem("admin_auth_token", res.token);
      localStorage.setItem("admin_auth_user", JSON.stringify(res.user));
      window.location.href = tenantPath(res.companySlug, res.outletSlug, "admin");
    } catch {
      // enter-outlet failing here is rare (the outlet existed a moment ago,
      // per the list this menu is built from) — a full reload retry is
      // simpler than a bespoke error path for a case this narrow.
    }
  };

  const backToCompany = () => {
    localStorage.removeItem("admin_auth_token");
    localStorage.removeItem("admin_auth_user");
    navigate("/company");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-[var(--radius-btn)] px-2 py-2 text-left text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--ink)]">
          <Building2 className="h-4 w-4 flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">{companyInfo.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[220px]">
        <DropdownMenuItem onClick={backToCompany} className="cursor-pointer">
          <ArrowLeft />
          Back to company dashboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Outlets</DropdownMenuLabel>
        {active.map((outlet) => (
          <DropdownMenuItem
            key={outlet.id}
            disabled={outlet.slug === outletSlug}
            onClick={() => enterOutlet(outlet)}
            className="cursor-pointer"
          >
            {outlet.name}
            {outlet.slug === outletSlug ? " (current)" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Wire it into `AdminLayout`'s topbar**

In `frontend/src/components/admin/AdminLayout.tsx`, add the import next to the existing `AccountMenu` import (around line 26):

```tsx
import { AccountMenu } from "../shared/AccountMenu";
import { OrgSwitcher } from "./OrgSwitcher";
```

Then, in the topbar JSX (around line 252), render `OrgSwitcher` directly above the existing `AccountMenu` row:

```tsx
        <OrgSwitcher />

        <div className="mt-2 flex items-center gap-2 border-t border-[var(--line)] pt-3">
          <div className="min-w-0 flex-1">
            <AccountMenu
              initial={(account?.name || user?.name || "?").charAt(0).toUpperCase()}
              name={account?.name || user?.name || ""}
              settingsPath={staffOnly ? undefined : "settings"}
              onLogout={handleLogout}
              dropUp
            />
          </div>
          <ThemeToggle className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]" />
        </div>
```

`OrgSwitcher` renders `null` for a genuine outlet admin (no `company_session`), so nothing else in this block needs to branch on who's signed in.

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify the negative case — no switcher for a real outlet admin**

Start the backend on the mock DB (`MONGODB_URI="" npm run dev -w backend`) and the frontend. Sign in at `/admin-login` as `thamel@coffesarowar.com` / `password` (a genuine single-outlet admin, no company relationship). Confirm no switcher renders in the topbar above the account menu.

- [ ] **Step 5: Verify the positive case — full switch flow**

Sign out, sign in as `owner@coffesarowar.com` / `password` (a company owner), land at `/company`, click into any outlet. Confirm:

1. The switcher renders above the account menu, showing "Coffesarowar Group" (or whatever the company name is) with a chevron.
2. Opening it lists "Back to company dashboard", then every active outlet, with the current one shown disabled and marked "(current)".
3. Picking a different outlet lands in that outlet's console (URL changes, `localStorage.admin_auth_user` reflects the new outlet).
4. "Back to company dashboard" lands at `/company`; `localStorage.admin_auth_token` is now empty; `localStorage.company_session` is unchanged (still signed in as the owner — confirm by refreshing `/company`, which must not redirect to login).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/OrgSwitcher.tsx frontend/src/components/admin/AdminLayout.tsx
git commit -m "feat: add org switcher for company owners viewing an outlet console"
```
