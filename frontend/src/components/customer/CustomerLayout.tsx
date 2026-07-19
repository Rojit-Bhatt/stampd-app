import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link, NavLink } from "react-router-dom";
import { QrCode, Coffee, Coins, UtensilsCrossed, CircleUser, ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useTenant } from "../../context/TenantContext";
import { useAccount } from "../../hooks/useAccount";
import { BottomNav } from "./BottomNav";
import { ScannerModal } from "./ScannerModal";
import { tenantPath } from "../../lib/tenantPath";

// The authenticated customer app shell.
//
// It is NOT a phone frame on desktop. It used to render inside a fixed 420px
// rounded rectangle at every size above `sm`, which made a laptop show a
// picture of a phone. Mobile is still the baseline — that's what customers
// actually scan with — but desktop gets the width it has, with the tabs moved
// into the header and the floating pill dropped.
function DesktopTab({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-[var(--radius-btn)] px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
          isActive
            ? "bg-[var(--primary-soft)] text-[var(--primary-deep)]"
            : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        }`
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

export function CustomerLayout() {
  const { companySlug, slug, tenant } = useTenant();
  const { user, isLoading } = useCustomerAuth();
  const { data: account } = useAccount("customer");
  const navigate = useNavigate();
  const location = useLocation();
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "customer")) {
      navigate(tenantPath(companySlug, slug, "login"));
    }
  }, [user, isLoading, navigate, slug]);

  if (isLoading || !user || user.role !== "customer") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  const activeTab = location.pathname.endsWith("/history")
    ? "history"
    : location.pathname.endsWith("/dashboard")
      ? "dashboard"
      : location.pathname.endsWith("/menu")
        ? "menu"
        : location.pathname.endsWith("/settings")
          ? "settings"
          : "none";

  const path = (sub: string) => tenantPath(companySlug, slug, sub);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <ScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        slug={slug}
        tenantName={tenant?.name || ""}
      />

      <header className="sticky top-0 z-20 flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-5 py-3">
          {/* Every customer arrived either from /explore or a scanned QR —
              either way, /explore is always a safe "up a level" — this is
              the one place in a tenant's subtree that isn't tenant-themed,
              since it's leaving the tenant. */}
          <Link
            to="/explore"
            aria-label="Back to Explore"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>

          {/* Inside an outlet, the outlet is the identity — its own tile and
              name, in its own colour. Stampd's mark belongs on /explore. */}
          <Link to={path("dashboard")} className="flex min-w-0 items-center gap-2.5">
            {tenant?.branding?.logoUrl ? (
              <img
                src={tenant.branding.logoUrl}
                alt=""
                className="h-9 w-9 flex-shrink-0 rounded-[var(--radius-field)] object-cover"
              />
            ) : (
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-field)] font-display text-sm font-bold"
                style={{ background: "var(--brand)", color: "var(--brand-on)" }}
              >
                {(tenant?.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate font-display text-base font-bold text-[var(--ink)]">
              {tenant?.name}
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            <DesktopTab to={path("dashboard")} icon={Coffee} label="Card" />
            <DesktopTab to={path("menu")} icon={UtensilsCrossed} label="Menu" />
            <DesktopTab to={path("history")} icon={Coins} label="Points" />
            <DesktopTab to={path("settings")} icon={CircleUser} label="Profile" />
          </nav>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2">
            {/* Scanning is the primary action, so on desktop — where there's
                no bottom pill — it's a full labelled button, not an icon. */}
            <button
              onClick={() => setScanOpen(true)}
              aria-label="Scan a code"
              className="hidden items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 lg:flex"
            >
              <QrCode className="h-4 w-4" />
              Scan
            </button>
            <Link
              to={path("settings")}
              aria-label="Profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-bold text-[var(--ink)] transition-colors hover:bg-[var(--line)]"
            >
              {(account?.name || "?").charAt(0).toUpperCase()}
            </Link>
          </div>
        </div>
      </header>

      {/* Clears the fixed bottom nav on phones. This is for a LONG page: it
          guarantees the true last item of a tall list (CustomerHistory's
          ledger, a long menu) isn't left sitting behind the nav once
          scrolled all the way down — padding after the content can't do
          anything for a SHORT page, since it doesn't move content that's
          already above it, only adds trailing space past it. */}
      <main className="flex-1 pb-28 lg:pb-0">
        <Outlet />
      </main>

      {/* Thumb-zone nav on phones only. */}
      <div className="lg:hidden">
        <BottomNav slug={slug} activeTab={activeTab} onScanClick={() => setScanOpen(true)} />
      </div>
    </div>
  );
}

export default CustomerLayout;
