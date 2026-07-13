import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Coffee, Gift } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useStampCard } from "../hooks/useStampCard";
import { PunchCard } from "../components/PunchCard";
import { BottomNav } from "../components/BottomNav";
import { ScannerModal } from "../components/ScannerModal";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Cafe Coffesarowar" },
      { name: "description", content: "Your stamp card and rewards at Cafe Coffesarowar." },
    ],
  }),
  component: DashboardPage,
});

const TOTAL_STAMPS = 5;

function DashboardPage() {
  const [scanOpen, setScanOpen] = useState(false);
  const { user, isLoading, logout } = useAuth();
  const { data: stampData, isLoading: cardLoading } = useStampCard();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "customer")) {
      navigate({ to: "/login" });
    }
  }, [user, isLoading, navigate]);

  if (isLoading || cardLoading || !user || user.role !== "customer") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212]">
        <div className="h-8 w-8 animate-spin rounded-full border border-[#EBE6DF] border-t-transparent" />
      </div>
    );
  }

  const stampsEarned = stampData?.stampsEarned ?? 0;

  return (
    <div className="min-h-screen w-full bg-[#121212] font-sans text-[#EBE6DF] flex items-center justify-center">
      {/* Mobile-constrained frame, scales beautifully to tablet/desktop */}
      <div className="mx-auto flex min-h-screen sm:min-h-[85vh] w-full max-w-full sm:max-w-md md:max-w-lg flex-col bg-[#121212] text-[#EBE6DF] border-x-0 sm:border border-[#2D2D2D] rounded-none sm:rounded-[40px] overflow-hidden shadow-2xl">
        <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} />

        {/* Top Nav */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 xs:gap-3 border-b border-[#2D2D2D] bg-[#121212] px-4 xs:px-5 py-3 xs:py-4">
          <div className="flex min-w-0 items-center gap-2 xs:gap-3">
            <div className="grid h-9 w-9 xs:h-10 xs:w-10 shrink-0 place-items-center border border-[#2D2D2D] bg-[#1A1A1A] text-[#EBE6DF] rounded-[12px] xs:rounded-[16px]">
              <Coffee className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] xs:text-[10px] font-bold uppercase tracking-[0.15em] xs:tracking-[0.2em] text-[#A3A3A3] truncate">
                Cafe Coffesarowar
              </p>
              <h1 className="truncate text-sm xs:text-base text-[#EBE6DF] font-serif font-normal">
                Welcome, {user.name}!
              </h1>
            </div>
          </div>
          <button
            onClick={logout}
            className="inline-flex shrink-0 items-center rounded-[16px] xs:rounded-[20px] border border-[#2D2D2D] bg-[#1A1A1A] px-2.5 xs:px-3 py-1 xs:py-1.5 text-[10px] xs:text-xs font-bold text-[#EBE6DF] transition-colors hover:bg-[#EBE6DF] hover:text-black"
            aria-label="Log out"
          >
            <span>Logout</span>
          </button>
        </header>

        {/* Main */}
        <main className="flex-1 space-y-5 px-4 xs:px-5 py-5 xs:py-6 bg-[#121212] overflow-y-auto">
          {/* Progress summary */}
          <div className="flex flex-wrap items-end justify-between gap-2.5">
            <div className="min-w-[150px]">
              <p className="text-xl xs:text-2xl leading-tight text-[#EBE6DF] font-serif font-normal">
                {stampsEarned} of {TOTAL_STAMPS} stamps
              </p>
              <p className="mt-0.5 text-xs xs:text-sm text-[#A3A3A3]">
                {TOTAL_STAMPS - stampsEarned} more to a free coffee.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-[16px] border border-[#2D2D2D] bg-[#1A1A1A] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#EBE6DF]">
              <Gift className="h-3 w-3" /> Active
            </span>
          </div>

          {/* Stamp card */}
          <section
            className="relative overflow-hidden rounded-[32px] xs:rounded-[40px] border border-[#2D2D2D] bg-[#1A1A1A] p-4 xs:p-6 shadow-none"
            aria-label="Digital stamp card"
          >
            <div className="relative">
              <div className="flex items-center justify-between">
                <p className="text-[9px] xs:text-[10px] font-bold uppercase tracking-[0.2em] text-[#A3A3A3]">
                  Loyalty Card
                </p>
                <p className="text-[9px] xs:text-[10px] font-bold uppercase tracking-[0.2em] text-[#A3A3A3]">
                  No. 00421
                </p>
              </div>

              <PunchCard stampsEarned={stampsEarned} />

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-[20px] xs:rounded-[24px] border border-[#2D2D2D] bg-[#121212] px-3.5 xs:px-4 py-2.5 xs:py-3">
                <p className="text-[11px] xs:text-xs font-semibold text-[#A3A3A3] truncate">
                  Reward at stamp 5
                </p>
                <p className="text-[11px] xs:text-xs font-bold text-[#EBE6DF] shrink-0">
                  1 Free Coffee
                </p>
              </div>
            </div>
          </section>

          <p className="text-center text-xs text-[#A3A3A3]">
            Tap Scan Counter QR at checkout to collect your stamp.
          </p>
        </main>

        {/* Shared Bottom Nav */}
        <BottomNav activeTab="dashboard" onScanClick={() => setScanOpen(true)} />
      </div>
    </div>
  );
}
