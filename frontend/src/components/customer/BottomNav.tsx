import { Link } from "react-router-dom";
import { Coffee, QrCode, Coins, UtensilsCrossed, Settings } from "lucide-react";
import { tenantPath } from "../../lib/tenantPath";
import { useTenant } from "../../context/TenantContext";

interface BottomNavProps {
  slug: string;
  activeTab: "dashboard" | "history" | "menu" | "settings" | "none";
  onScanClick: () => void;
}

export function BottomNav({ slug, activeTab, onScanClick }: BottomNavProps) {
  const { companySlug } = useTenant();
  return (
    <footer className="relative flex-shrink-0 px-4 pb-5 pt-2">
      <div className="shadow-ambient relative mx-auto flex max-w-md items-center justify-between rounded-full bg-[var(--surface)] px-5 py-2">
        <Link
          to={tenantPath(companySlug, slug, "dashboard")}
          className={`flex min-h-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "dashboard"
              ? "text-[var(--brand)]"
              : "text-[var(--soft)] hover:text-[var(--brand)]"
          }`}
          aria-label="Points balance"
        >
          <Coffee className="h-5 w-5" strokeWidth={activeTab === "dashboard" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Card</span>
        </Link>

        <Link
          to={tenantPath(companySlug, slug, "menu")}
          className={`flex min-h-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "menu"
              ? "text-[var(--brand)]"
              : "text-[var(--soft)] hover:text-[var(--brand)]"
          }`}
          aria-label="Menu"
        >
          <UtensilsCrossed className="h-5 w-5" strokeWidth={activeTab === "menu" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Menu</span>
        </Link>

        {/* Center scan FAB */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onScanClick}
            className="flex items-center justify-center rounded-[20px] text-white transition-transform duration-200 hover:scale-105 active:scale-95"
            style={{
              width: 60,
              height: 60,
              background: "var(--brand)",
              boxShadow: "0 12px 24px -8px var(--brand)",
            }}
            aria-label="Scan to earn points"
          >
            <QrCode className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
        <div className="w-14" aria-hidden="true" />

        <Link
          to={tenantPath(companySlug, slug, "history")}
          className={`flex min-h-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "history"
              ? "text-[var(--brand)]"
              : "text-[var(--soft)] hover:text-[var(--brand)]"
          }`}
          aria-label="Points history"
        >
          <Coins className="h-5 w-5" strokeWidth={activeTab === "history" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Points</span>
        </Link>

        <Link
          to={tenantPath(companySlug, slug, "settings")}
          className={`flex min-h-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "settings"
              ? "text-[var(--brand)]"
              : "text-[var(--soft)] hover:text-[var(--brand)]"
          }`}
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" strokeWidth={activeTab === "settings" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Settings</span>
        </Link>
      </div>
    </footer>
  );
}
export default BottomNav;
