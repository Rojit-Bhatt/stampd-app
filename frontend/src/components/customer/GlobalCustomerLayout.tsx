import { useEffect, useState } from "react";
import { Outlet, Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { QrCode, Compass, Store, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { PLATFORM_NAME } from "../../lib/platform";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { GlobalScannerModal } from "./GlobalScannerModal";
import { CustomerAvatar } from "./CustomerAvatar";
import { useMyTenants } from "../../hooks/useMyTenants";
import { StampdLogo } from "../shared/StampdLogo";

// The global (cross-tenant) customer shell for /explore + /explore/mine —
// parallel to CustomerLayout but with no active TenantProvider or tenant JWT:
// it guards on the global CustomerAccount session only.
//
// This is the one part of the customer app that is unambiguously Stampd's:
// no outlet themes it, so it carries the platform mark and the platform green.

function Tab({
  to,
  icon: Icon,
  label,
  variant,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  variant: "bottom" | "top";
}) {
  if (variant === "top") {
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

  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-field)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
          isActive ? "text-[var(--primary-deep)]" : "text-[var(--soft)] hover:text-[var(--ink)]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.9} />
          <span className="text-[10px] font-bold tracking-wide">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function GlobalCustomerLayout() {
  const { globalAccount, logout } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  // Also warms the query cache Explore's "My places" row and ExploreMine both
  // read from, so switching tabs is instant.
  // `error`, not `isError` — same reason as AdminGuard: once this query has
  // data, a failed background refetch leaves status "success" and isError
  // false, so a session going stale mid-visit would never be caught.
  const { error: myTenantsErrorObj } = useMyTenants();
  const myTenantsError = Boolean(myTenantsErrorObj);

  useEffect(() => {
    if (!globalAccount) {
      navigate("/customer-login");
    }
  }, [globalAccount, navigate]);

  // A stale/expired/revoked global session token would otherwise strand the
  // customer here forever (globalAccount is just cached localStorage data,
  // never itself proof the token still verifies) — mirrors AdminGuard's
  // revalidate-on-401 pattern.
  useEffect(() => {
    if (myTenantsError && globalAccount) {
      logout();
      navigate("/customer-login");
    }
  }, [myTenantsError, globalAccount, logout, navigate]);

  if (!globalAccount) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  // location is read so the shell re-renders on navigation; NavLink handles
  // its own active state.
  void location;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <GlobalScannerModal open={scanOpen} onClose={() => setScanOpen(false)} />

      <ConfirmDialog
        open={confirmLogoutOpen}
        onOpenChange={setConfirmLogoutOpen}
        title="Log out?"
        description="You'll need to sign in again to see your businesses."
        confirmLabel="Log out"
        confirmColor="var(--primary)"
        onConfirm={() => {
          logout();
          navigate("/customer-login");
        }}
      />

      <header className="sticky top-0 z-20 flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-5 py-3">
          <Link to="/explore" className="flex flex-shrink-0 items-center gap-2">
            <StampdLogo size={22} />
            <span className="font-display text-lg font-bold text-[var(--ink)]">
              {PLATFORM_NAME}
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            <Tab to="/explore" icon={Compass} label="Home" variant="top" />
            <Tab to="/explore/mine" icon={Store} label="My businesses" variant="top" />
          </nav>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2">
            <button
              onClick={() => setScanOpen(true)}
              aria-label="Scan a business's QR code"
              className="flex items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--primary)] px-3.5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            >
              <QrCode className="h-4 w-4" />
              <span className="hidden sm:inline">Scan</span>
            </button>
            {/* Identity, not a control — /explore has no profile page of its
                own (that lives inside an outlet). It's here so the customer
                can tell at a glance which account they're signed in as
                before they act on anything. */}
            <CustomerAvatar
              accountId={globalAccount.id}
              avatarVersion={globalAccount.avatarVersion}
              name={globalAccount.name}
              size={36}
              // Standing alone with nothing labelling it, so it announces
              // itself — otherwise the "which account am I?" signal it exists
              // to give is visual-only.
              labelled
            />
            <button
              onClick={() => setConfirmLogoutOpen(true)}
              aria-label="Log out"
              title={globalAccount.name || "Log out"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:bg-[var(--line)] hover:text-[var(--ink)]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* pb-24 clears the fixed bottom nav on phones; lg:pb-0 because it's
          hidden entirely at that width. */}
      <main className="flex-1 pb-24 lg:pb-0">
        <Outlet />
      </main>

      {/* `fixed`, not `sticky` — see BottomNav.tsx for why: sticky only pins
          once the page has scrolled far enough to need it, so a short page
          left the nav sitting after the content instead of glued to the
          screen. */}
      <footer className="fixed inset-x-0 bottom-0 z-30 flex-shrink-0 px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto flex max-w-md items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-float">
          <Tab to="/explore" icon={Compass} label="Home" variant="bottom" />
          <Tab to="/explore/mine" icon={Store} label="My businesses" variant="bottom" />
        </div>
      </footer>
    </div>
  );
}

export default GlobalCustomerLayout;
