import { Coffee } from "lucide-react";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { useTenant } from "../context/TenantContext";
import { useStampCard } from "../hooks/useStampCard";
import { PunchCard } from "../components/customer/PunchCard";

// Rendered inside CustomerLayout (phone shell + bottom nav). Content only.
export default function CustomerDashboard() {
  const { logout } = useCustomerAuth();
  const { tenant } = useTenant();
  const { data: stampData, isLoading: cardLoading } = useStampCard();

  const program = tenant?.program;
  const required = stampData?.stampsRequired ?? program?.stampsRequired ?? 5;
  const reward = stampData?.rewardTitle ?? program?.rewardTitle ?? "Reward";
  const stampsEarned = stampData?.stampsEarned ?? 0;
  const remaining = Math.max(0, required - stampsEarned);
  const initial = (tenant?.name || "?").charAt(0).toUpperCase();

  const awayText =
    remaining > 0
      ? `You're ${remaining} stamp${remaining > 1 ? "s" : ""} from a ${reward}`
      : "Card complete — your reward is ready!";

  return (
    <div className="px-5 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-[13px] font-display text-[17px] font-extrabold text-white"
          style={{ background: "var(--brand)" }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--muted)]">Welcome back ☕</div>
          <div className="truncate font-display text-lg font-bold leading-tight text-[var(--ink)]">
            {tenant?.name}
          </div>
        </div>
        <button
          onClick={logout}
          className="rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          Logout
        </button>
      </div>

      {/* Reward card */}
      <div
        className="mb-4 rounded-[26px] p-6 text-white"
        style={{
          background: "linear-gradient(155deg, var(--brand), var(--brand-deep))",
          boxShadow: "0 22px 44px -22px var(--brand)",
        }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider opacity-80">Reward card</div>
            <div className="font-display text-[22px] font-extrabold">{reward}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-extrabold leading-none">
              {cardLoading ? "—" : `${stampsEarned} of ${required}`}
            </div>
            <div className="text-[11px] opacity-80">stamps</div>
          </div>
        </div>
        <PunchCard stampsEarned={stampsEarned} stampsRequired={required} />
      </div>

      {/* Away hint */}
      <div className="mb-2 flex items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-white"
          style={{ background: "var(--brand)" }}
        >
          <Coffee className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-[var(--ink)]">{awayText}</span>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        Tap the scan button below and point at the barista’s QR to earn a stamp.
      </p>
    </div>
  );
}
