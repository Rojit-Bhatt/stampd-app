import React, { createContext, useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest, setTenantSlug } from "../lib/api";

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
  stampsRequired: number;
  rewardTitle: string;
  rewardDescription: string;
  cooldownHours: number;
}

export interface Tenant {
  slug: string;
  name: string;
  branding: TenantBranding;
  contact: TenantContact;
  upcomingEvents: TenantEvent[];
  program: TenantProgram;
  menuEnabled: boolean;
}

interface TenantContextValue {
  slug: string;
  tenant: Tenant | null;
  isLoading: boolean;
  notFound: boolean;
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
  const { slug = "" } = useParams();

  // Set the slug synchronously so any request a child fires (e.g. login)
  // already carries the X-Tenant-Slug header the public routes require.
  setTenantSlug(slug);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setTenantSlug(slug);
    let active = true;
    setIsLoading(true);
    setNotFound(false);

    apiRequest<{ success: boolean; tenant: Tenant }>("/api/tenant")
      .then((res) => {
        if (!active) return;
        setTenant(res.tenant);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setNotFound(true);
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const brand = tenant?.branding?.primaryColor || "#B5533C";
  const brandDeep = darken(brand);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
      </div>
    );
  }

  if (notFound || !tenant) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
        <div className="font-display text-[90px] font-extrabold leading-none text-[var(--plat-soft)]">
          404
        </div>
        <h2 className="mt-2 font-display text-2xl font-bold text-[var(--ink)]">
          Business not found
        </h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
          We couldn’t find a business at <span className="font-mono">/{slug}</span>. Check the link
          and try again.
        </p>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={{ slug, tenant, isLoading, notFound }}>
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
