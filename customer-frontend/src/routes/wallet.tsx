import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Copy, Coffee, Check, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useVouchers } from "../hooks/useVouchers";
import { BottomNav } from "../components/BottomNav";
import { ScannerModal } from "../components/ScannerModal";
import toast from "react-hot-toast";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — Cafe Coffesarowar" },
      { name: "description", content: "Your earned rewards and coupons at Cafe Coffesarowar." },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { user, isLoading } = useAuth();
  const { data: vouchers = [], isLoading: vouchersLoading, error } = useVouchers();
  const navigate = useNavigate();
  
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "customer")) {
      navigate({ to: "/login" });
    }
  }, [user, isLoading, navigate]);

  if (isLoading || vouchersLoading || !user || user.role !== "customer") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212]">
        <div className="h-8 w-8 animate-spin rounded-none border border-[#EBE6DF] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#121212] font-sans text-[#EBE6DF]">
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col bg-[#121212] text-[#EBE6DF] border-x border-[#2D2D2D] rounded-[48px] overflow-hidden">
        <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} />

        {/* Header */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#2D2D2D] bg-[#121212] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#A3A3A3]">
              Your Rewards
            </p>
            <h1
              className="text-base text-[#EBE6DF] font-serif font-normal"
            >
              Voucher Wallet
            </h1>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-[12px] border border-[#2D2D2D] bg-[#1A1A1A] text-xs font-bold text-[#EBE6DF]">
            {vouchers.length}
          </span>
        </header>

        {/* Main List */}
        <main className="flex-1 space-y-5 px-4 py-6 overflow-y-auto">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-red-500">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm font-bold">Failed to load vouchers</p>
            </div>
          ) : vouchers.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center text-[#A3A3A3]">
              <div className="grid h-16 w-16 place-items-center rounded-[24px] border border-[#2D2D2D] bg-[#1A1A1A]">
                <Coffee className="h-7 w-7 text-[#A3A3A3]/45" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#EBE6DF]">Your wallet is empty</p>
                <p className="mt-1 text-xs text-[#A3A3A3]">
                  Complete your punch card to earn a free coffee reward!
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-center text-xs text-[#A3A3A3] font-medium">
                {vouchers.length} active {vouchers.length === 1 ? "reward" : "rewards"} · Tap code to copy
              </p>

              {vouchers.map((v) => (
                <VoucherTicket key={v.voucherCode} voucher={v} />
              ))}
            </>
          )}

          <div className="pt-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#A3A3A3]">
              — End of wallet —
            </p>
          </div>
        </main>

        {/* Shared Bottom Nav */}
        <BottomNav activeTab="wallet" onScanClick={() => setScanOpen(true)} />
      </div>
    </div>
  );
}

function VoucherTicket({ voucher }: { voucher: { voucherCode: string; isValid: boolean; earnedAt: string } }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(voucher.voucherCode);
      setCopied(true);
      toast.success("Voucher code copied!");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const formattedDate = new Date(voucher.earnedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const isRedeemed = !voucher.isValid;

  return (
    <article
      className="relative animate-fade-in"
      style={{
        filter: isRedeemed ? "grayscale(100%) opacity(0.4)" : "none",
      }}
    >
      <div className="relative bg-[#1A1A1A] text-[#EBE6DF] border border-[#2D2D2D] rounded-[40px] overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          {/* Left section */}
          <div className="min-w-0 p-5">
            <div className="flex items-center gap-2 text-[#EBE6DF]">
              <span className="grid h-8 w-8 place-items-center border border-[#2D2D2D] bg-[#121212] text-[#EBE6DF] rounded-[10px]">
                <Coffee className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#EBE6DF]">
                {isRedeemed ? "Redeemed Voucher" : "Free Coffee Voucher"}
              </span>
            </div>
            
            <h2
              className="mt-3 truncate text-lg text-[#EBE6DF] font-serif font-normal"
            >
              1 Free Coffee
            </h2>
            <p className="mt-0.5 truncate text-xs text-[#A3A3A3]">
              Present code at counter to redeem
            </p>

            <button
              type="button"
              onClick={copy}
              disabled={isRedeemed}
              className="mt-4 inline-flex items-center gap-2 rounded-[20px] border border-[#2D2D2D] bg-[#121212] px-3 py-2 font-mono text-[13px] font-bold tracking-[0.14em] text-[#EBE6DF] transition-colors hover:bg-[#EBE6DF] hover:text-black disabled:opacity-50"
              aria-label={`Copy voucher code ${voucher.voucherCode}`}
            >
              <span>{voucher.voucherCode}</span>
              <Copy className="h-3.5 w-3.5 text-[#EBE6DF]/50" />
              {copied && (
                <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-[#EBE6DF]">
                  <Check className="h-3 w-3 inline mr-0.5" />
                  Copied
                </span>
              )}
            </button>

            <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[#A3A3A3]">
              Earned {formattedDate}
            </p>
          </div>

          {/* Divider */}
          <div className="relative flex items-center">
            <div
              className="h-[85%] border-l border-dashed border-[#2D2D2D]"
              aria-hidden
            />
          </div>

          {/* Right stub */}
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-5 bg-[#1A1A1A] border-l border-[#2D2D2D]">
            <div
              className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#EBE6DF]"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              {isRedeemed ? "Redeemed" : "Scan Counter To Redeem"}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
