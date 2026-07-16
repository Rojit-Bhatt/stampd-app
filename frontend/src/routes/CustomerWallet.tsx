import { Copy, Ticket, AlertCircle, Gift } from "lucide-react";
import { useState } from "react";
import { useTenant } from "../context/TenantContext";
import { useVouchers } from "../hooks/useVouchers";
import toast from "react-hot-toast";
import { Skeleton } from "../components/ui/skeleton";

// Rendered inside CustomerLayout (phone shell + bottom nav). Content only.
export default function CustomerWallet() {
  const { tenant } = useTenant();
  const { data: vouchers = [], isLoading, error } = useVouchers();

  const isExpired = (v: { expiresAt: string | null }) => Boolean(v.expiresAt && new Date(v.expiresAt) < new Date());
  const visible = vouchers.filter((v) => v.isValid);
  const active = visible.filter((v) => !isExpired(v));
  const reward = tenant?.program?.rewardTitle || "Reward";

  return (
    <div className="px-5 py-6">
      <h1 className="font-display text-2xl font-bold text-[var(--ink)]">My wallet</h1>
      <p className="mb-5 text-[13px] text-[var(--muted)]">
        {active.length} active voucher{active.length === 1 ? "" : "s"} · {tenant?.name}
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-[var(--line)]">
              <div className="p-4">
                <Skeleton className="mb-3 h-6 w-28" />
                <Skeleton className="h-[52px] w-full rounded-[12px]" />
              </div>
              <div className="flex justify-between px-4 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-[var(--err)]">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-bold">Failed to load vouchers</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-[var(--line)] bg-[var(--bg)]">
            <Ticket className="h-7 w-7 text-[var(--soft)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--ink)]">Your wallet is empty</p>
            <p className="mx-auto mt-1 max-w-[240px] text-xs text-[var(--muted)]">
              Complete your stamp card to earn a {reward} voucher.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((v) => (
            <VoucherTicket
              key={v.voucherCode}
              code={v.voucherCode}
              reward={reward}
              earnedAt={v.earnedAt}
              expiresAt={v.expiresAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VoucherTicket({
  code,
  reward,
  earnedAt,
  expiresAt,
}: {
  code: string;
  reward: string;
  earnedAt: string;
  expiresAt: string | null;
}) {
  const expired = Boolean(expiresAt && new Date(expiresAt) < new Date());
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Copied! Show that at the counter.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const earned = earnedAt
    ? new Date(earnedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "";

  return (
    <div className="shadow-ambient stamp-interactive flex overflow-hidden rounded-3xl bg-[var(--surface)]">
      {/* Ticket stub: a perforated seam with notch cutouts, echoing a paper coupon. */}
      <div
        className="relative flex w-[92px] flex-shrink-0 flex-col items-center justify-center gap-1 text-white"
        style={{ background: "var(--brand)" }}
      >
        <Gift className="h-6 w-6" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Reward</span>
        <span
          className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-[var(--bg)]"
          aria-hidden="true"
        />
        <span
          className="absolute -bottom-2.5 -right-2.5 h-5 w-5 rounded-full bg-[var(--bg)]"
          aria-hidden="true"
        />
        <span
          className="absolute right-0 top-1/2 h-[85%] w-px -translate-y-1/2 border-r-2 border-dashed border-white/40"
          aria-hidden="true"
        />
      </div>
      <div className="flex-1 p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="font-display text-lg font-bold text-[var(--ink)]">{reward}</span>
          <span
            className="flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={
              expired
                ? { background: "var(--surface-container-high)", color: "var(--soft)" }
                : { background: "var(--ok-soft)", color: "var(--ok)" }
            }
          >
            {expired ? "Expired" : "Active"}
          </span>
        </div>
        <div className="mb-3 flex items-center justify-between rounded-xl bg-[var(--surface-container)] px-3 py-2.5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--soft)]">Code</div>
            <div className="font-mono text-sm font-bold tracking-[0.05em] text-[var(--ink)]">{code}</div>
          </div>
          <button
            onClick={copy}
            className="stamp-interactive flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
            style={{ background: "var(--brand)" }}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="flex justify-between text-xs text-[var(--muted)]">
          <span>Earned {earned}</span>
          <span>Show at counter</span>
        </div>
      </div>
    </div>
  );
}
