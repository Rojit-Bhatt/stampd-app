import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { SuspendedOverlay } from "./SuspendedOverlay";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAdminAuth();
  const navigate = useNavigate();
  // Not useTenant() — that throws outside a TenantProvider, and AdminGuard
  // also has to survive a settings 401 before we know the tenant resolved at
  // all. Raw params only, matching what the two-segment route actually
  // provides (companySlug + outletSlug — there is no bare :slug anywhere).
  const { companySlug, outletSlug } = useParams();
  const tenantSlugPath = companySlug && outletSlug ? `/${companySlug}/${outletSlug}` : null;
  const { data: settings, isLoading: settingsLoading, error: settingsErrorObj } = useAdminSettings();
  const suspended = (settingsErrorObj as (Error & { code?: string }) | null)?.code === "TENANT_SUSPENDED";

  // Deliberately `error`, not `isError`. In TanStack Query v5 a query that
  // ALREADY HAS DATA and then fails a background refetch keeps status
  // "success" — isError stays false and only `error` is populated. Reading
  // isError therefore caught a 401 on first load but missed the case that
  // actually happens to staff: a token going stale mid-shift while the
  // console is open. The console kept rendering happily off cached data
  // while every write failed, which is precisely the stranding this guard
  // exists to prevent.
  const settingsError = Boolean(settingsErrorObj);

  // Latched, not read live: AdminLayout (rendered as `children` below) also
  // calls useAdminSettings() itself, so mounting/unmounting it in direct
  // response to this same query's transient state creates a feedback loop
  // — AdminLayout's fresh observer re-triggers a background refetch of the
  // already-errored query, which flips this query's loading state again,
  // which would unmount AdminLayout again, which mounts a fresh observer...
  // Latching means once we've identified a suspended tenant, the blurred
  // children stay mounted continuously regardless of later flicker.
  const [suspendedLatched, setSuspendedLatched] = useState(false);
  useEffect(() => {
    if (suspended) setSuspendedLatched(true);
    else if (settings) setSuspendedLatched(false);
  }, [suspended, settings]);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "business_admin")) {
      navigate(tenantSlugPath ? `${tenantSlugPath}/admin/login` : "/");
    }
  }, [user, isLoading, navigate, tenantSlugPath]);

  // A cached token can outlive the session it names (backend data reset,
  // token expiry). Without this, a stale token stuck the guard in a
  // permanent "Verifying credentials" loop — the settings fetch kept
  // 401ing while the guard kept trusting the stale localStorage user.
  // A SUSPENDED tenant is deliberately excluded here — that case shows the
  // blur overlay below instead of logging the admin out.
  useEffect(() => {
    if (settingsError && user && !suspended && !suspendedLatched) {
      logout();
      navigate(tenantSlugPath ? `${tenantSlugPath}/admin/login` : "/");
    }
  }, [settingsError, user, suspended, suspendedLatched, logout, navigate, tenantSlugPath]);

  if (isLoading || (user && user.role === "business_admin" && settingsLoading && !suspended && !suspendedLatched)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)] animate-pulse">
          Verifying credentials...
        </div>
      </div>
    );
  }

  if (!user || user.role !== "business_admin") {
    return null;
  }

  if (suspended || suspendedLatched) {
    return (
      <div className="relative min-h-screen">
        <div className="pointer-events-none select-none blur-sm">{children}</div>
        <SuspendedOverlay onLogout={() => { logout(); navigate(tenantSlugPath ? `${tenantSlugPath}/admin/login` : "/"); }} />
      </div>
    );
  }

  // No re-check of adminEmailVerified here: adminAuthService.adminLogin
  // already refuses an unverified admin with 403 EMAIL_NOT_VERIFIED before
  // issuing a token, so anyone reaching this point with a valid tenant JWT
  // is, by construction, already verified. Re-checking here was gating
  // already-verified admins on a denormalized field that isn't guaranteed
  // to be in sync moment-to-moment with the source of truth.

  return <>{children}</>;
}
