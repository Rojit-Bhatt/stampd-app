import React, { createContext, useContext, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tenantPath } from "../lib/tenantPath";
import { apiRequest, setTenantRef } from "../lib/api";

export interface TenantBranding {
  tagline: string;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
}

export interface TenantContact {
  phone: string;
  email: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hours: string;
  aboutUs: string;
  socials: {
    instagram: string;
    facebook: string;
    x: string;
  };
}

export interface TenantEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
}

export interface TenantProgram {
  /** Percentage of the bill returned as points. 100 = 1 point per rupee. */
  earnPercent: number;
  /** 0 = points never expire. */
  pointsExpiryDays: number;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  branding: TenantBranding;
  contact: TenantContact;
  upcomingEvents: TenantEvent[];
  program: TenantProgram;
  menuEnabled: boolean;
}

interface TenantContextValue {
  companySlug: string;
  /** The outlet slug. `outletSlug` is the same value under its precise name. */
  slug: string;
  outletSlug: string;
  tenant: Tenant | null;
  isLoading: boolean;
  notFound: boolean;
  suspended: boolean;
  // Build any URL inside this outlet — never interpolate the slugs by hand.
  path: (sub?: string) => string;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

// Darken a #RRGGBB hex by `amount` (0..1) toward black — used to derive the
// gradient companion for the tenant's brand colour.
function darken(hex: string, amount = 0.22): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#8a3a28";
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { companySlug = "", outletSlug = "" } = useParams();
  const slug = outletSlug;
  const location = useLocation();

  // Set the pair synchronously so any request a child fires (e.g. login)
  // already carries the company+outlet headers the public routes require.
  setTenantRef(companySlug && outletSlug ? { company: companySlug, outlet: outletSlug } : null);

  // A plain useQuery (no staleTime override) so it refetches on window focus
  // and remount like the rest of the app's data hooks — branding/program/
  // contact/events an admin edits mid-session now reach an already-open
  // customer tab instead of requiring a hard reload.
  const {
    data: tenant,
    isLoading,
    isError,
    error,
  } = useQuery<Tenant>({
    queryKey: ["tenant", companySlug, outletSlug],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; tenant: Tenant }>("/api/tenant");
      return res.tenant;
    },
    enabled: Boolean(companySlug && outletSlug),
  });

  const liveSuspended = (error as (Error & { code?: string }) | null)?.code === "TENANT_SUSPENDED";
  // The admin console (/:slug/admin/*) has its own suspended-tenant handling
  // (AdminGuard's blurred overlay) driven by its own /api/admin/settings
  // fetch — it must render through here even though this tenant fetch also
  // 403s, rather than being pre-empted by this component's own full-screen
  // message meant for the customer-facing app.
  const isAdminRoute = location.pathname.startsWith(`/${companySlug}/${outletSlug}/admin`);

  const brand = tenant?.branding?.primaryColor || "#8C5E45";
  const brandDeep = darken(brand);

  // Latched into a ref, not read live off isLoading/isError/tenant each
  // render: this query intermittently passes through a transient state
  // (isLoading:false, isError:false, no tenant yet) on a background
  // refetch/remount, which is neither "loaded" nor a real error — reading
  // that transient state live would flash the wrong full-screen message
  // (typically the 404) in between genuinely-settled states. Only update
  // the latch when the query is UNAMBIGUOUSLY loaded or UNAMBIGUOUSLY
  // errored; otherwise keep whatever we last knew to be true.
  const statusRef = useRef<"loading" | "ready" | "suspended" | "notfound">("loading");
  if (tenant) {
    statusRef.current = "ready";
  } else if (isError) {
    statusRef.current = liveSuspended ? "suspended" : "notfound";
  }
  const status = statusRef.current;
  const suspended = status === "suspended";
  const notFound = status === "notfound";

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
      </div>
    );
  }

  if (suspended && !isAdminRoute) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
        <h2 className="font-display text-2xl font-bold text-[var(--ink)]">
          Temporarily unavailable
        </h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
          <span className="font-mono">/{companySlug}/{outletSlug}</span> isn't accepting visitors right now. Please
          check back later.
        </p>
      </div>
    );
  }

  if (!isAdminRoute && notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
        <div className="font-display text-[90px] font-extrabold leading-none text-[var(--plat-soft)]">
          404
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--ink)]">
          Business not found
        </h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
          We couldn’t find a business at <span className="font-mono">/{companySlug}/{outletSlug}</span>. Check the link
          and try again.
        </p>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={{ companySlug, slug, outletSlug, tenant: tenant ?? null, isLoading, notFound, suspended, path: (sub = "") => tenantPath(companySlug, outletSlug, sub) }}>
      <div style={{ ["--brand" as any]: brand, ["--brand-deep" as any]: brandDeep }}>
        {children}
      </div>
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (ctx === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}
