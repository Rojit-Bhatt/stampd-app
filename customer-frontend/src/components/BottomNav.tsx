import React from "react";
import { Link } from "@tanstack/react-router";
import { Coffee, QrCode, Ticket } from "lucide-react";

interface BottomNavProps {
  activeTab: "dashboard" | "wallet" | "none";
  onScanClick: () => void;
}

export function BottomNav({ activeTab, onScanClick }: BottomNavProps) {
  return (
    <footer className="sticky bottom-0 border-t border-[#2D2D2D] bg-[#121212] px-5 py-3 z-20 rounded-t-[32px] overflow-hidden">
      <div className="flex items-center justify-between max-w-md mx-auto relative px-4">
        {/* Left: Stamp Card Link */}
        <Link
          to="/dashboard"
          className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "dashboard" ? "text-[#EBE6DF]" : "text-[#A3A3A3] hover:text-[#EBE6DF]"
          }`}
          aria-label="Stamp Card"
        >
          <Coffee className="h-5 w-5" strokeWidth={activeTab === "dashboard" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Card</span>
        </Link>

        {/* Center: Scan QR Floating CTA */}
        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onScanClick}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EBE6DF] text-black border border-[#EBE6DF] transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none"
            aria-label="Scan Counter QR"
          >
            <QrCode className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>

        {/* Filler to maintain space for center button */}
        <div className="w-14" aria-hidden="true" />

        {/* Right: Wallet Link */}
        <Link
          to="/wallet"
          className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "wallet" ? "text-[#EBE6DF]" : "text-[#A3A3A3] hover:text-[#EBE6DF]"
          }`}
          aria-label="Voucher Wallet"
        >
          <Ticket className="h-5 w-5" strokeWidth={activeTab === "wallet" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Wallet</span>
        </Link>
      </div>
    </footer>
  );
}
