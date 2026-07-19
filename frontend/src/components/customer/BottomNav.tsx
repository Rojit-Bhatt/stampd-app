import { Link } from "react-router-dom";
import { Coffee, QrCode, Coins, UtensilsCrossed, CircleUser } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { tenantPath } from "../../lib/tenantPath";
import { useTenant } from "../../context/TenantContext";

type Tab = "dashboard" | "history" | "menu" | "settings" | "none";

interface BottomNavProps {
  slug: string;
  activeTab: Tab;
  onScanClick: () => void;
}

function NavLink({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-[var(--radius-field)] px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
        active ? "text-[var(--primary-deep)]" : "text-[var(--soft)] hover:text-[var(--ink)]"
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
      <span className="text-[10px] font-bold tracking-wide">{label}</span>
    </Link>
  );
}

// A floating pill rather than a bar welded to the bottom edge — it reads as
// something resting on the page, and the rounded shape keeps the centre FAB
// from looking bolted on.
//
// `fixed`, not `sticky`: sticky only pins once the page has scrolled far
// enough that the nav's normal flow position would go past the viewport
// edge — on a short page (little content, no scrolling needed) it just sits
// after the content instead, which is the "nav is down at the bottom of the
// page, not the screen" bug. Fixed pins it to the viewport unconditionally,
// which is what a bottom tab bar is supposed to do. CustomerLayout reserves
// matching bottom padding on the scrollable content so nothing sits under it.
//
// The active tab and the scan button are green: navigating and scanning are
// both ACTIONS. The tenant hue never appears here, so the nav looks and
// behaves identically at every outlet a customer belongs to.
export function BottomNav({ slug, activeTab, onScanClick }: BottomNavProps) {
  const { companySlug } = useTenant();
  const path = (sub: string) => tenantPath(companySlug, slug, sub);

  return (
    // pb accounts for the iOS home indicator when installed as a PWA.
    <footer className="fixed inset-x-0 bottom-0 z-30 flex-shrink-0 px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="relative mx-auto flex max-w-md items-center justify-between rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 shadow-float">
        <NavLink to={path("dashboard")} icon={Coffee} label="Card" active={activeTab === "dashboard"} />
        <NavLink to={path("menu")} icon={UtensilsCrossed} label="Menu" active={activeTab === "menu"} />

        {/* Centre scan FAB — the single most-used control in the customer app,
            so it gets the thumb zone and the loudest treatment. */}
        <div className="absolute -top-7 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onScanClick}
            aria-label="Scan a code"
            className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-float transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
          >
            <QrCode className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
        <div className="w-14" aria-hidden="true" />

        <NavLink to={path("history")} icon={Coins} label="Points" active={activeTab === "history"} />
        <NavLink to={path("settings")} icon={CircleUser} label="Profile" active={activeTab === "settings"} />
      </div>
    </footer>
  );
}

export default BottomNav;
