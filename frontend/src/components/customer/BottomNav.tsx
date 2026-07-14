import { Link } from "react-router-dom";
import { Coffee, QrCode, Ticket } from "lucide-react";

interface BottomNavProps {
  slug: string;
  activeTab: "dashboard" | "wallet" | "none";
  onScanClick: () => void;
}

export function BottomNav({ slug, activeTab, onScanClick }: BottomNavProps) {
  return (
    <footer className="relative flex-shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-6 pb-6 pt-3">
      <div className="relative mx-auto flex max-w-md items-center justify-between px-4">
        <Link
          to={`/${slug}/dashboard`}
          className={`flex min-h-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "dashboard"
              ? "text-[var(--brand)]"
              : "text-[var(--soft)] hover:text-[var(--brand)]"
          }`}
          aria-label="Stamp card"
        >
          <Coffee className="h-5 w-5" strokeWidth={activeTab === "dashboard" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Card</span>
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
            aria-label="Scan to earn a stamp"
          >
            <QrCode className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
        <div className="w-14" aria-hidden="true" />

        <Link
          to={`/${slug}/wallet`}
          className={`flex min-h-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "wallet"
              ? "text-[var(--brand)]"
              : "text-[var(--soft)] hover:text-[var(--brand)]"
          }`}
          aria-label="Voucher wallet"
        >
          <Ticket className="h-5 w-5" strokeWidth={activeTab === "wallet" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Wallet</span>
        </Link>
      </div>
    </footer>
  );
}
export default BottomNav;
