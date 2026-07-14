import { Copy, Ticket, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useTenant } from "../context/TenantContext";
import { useVouchers } from "../hooks/useVouchers";
import toast from "react-hot-toast";

// Rendered inside CustomerLayout (phone shell + bottom nav). Content only.
export default function CustomerWallet() {
  const { tenant } = useTenant();
  const { data: vouchers = [], isLoading, error } = useVouchers();

  const active = vouchers.filter((v) => v.isValid);
  const reward = tenant?.program?.rewardTitle || "Reward";

  return (
    <div className="px-5 py-6">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Wallet</h1>
      <p className="mb-5 text-[13px] text-[var(--muted)]">
        {active.length} active voucher{active.length === 1 ? "" : "s"} · {tenant?.name}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-[var(--err)]">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-bold">Failed to load vouchers</p>
        </div>
      ) : active.length === 0 ? (
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
          {active.map((v) => (
            <VoucherTicket key={v.voucherCode} code={v.voucherCode} reward={reward} earnedAt={v.earnedAt} />
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
}: {
  code: string;
  reward: string;
  earnedAt: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Voucher code copied!");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const earned = earnedAt
    ? new Date(earnedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "";

  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--line)]">
      <div
        className="p-4 text-white"
        style={{ background: "linear-gradient(140deg, var(--brand), var(--brand-deep))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-[19px] font-extrabold">{reward}</span>
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
            Active
          </span>
        </div>
        <div className="flex items-center justify-between rounded-[12px] bg-white/15 px-3.5 py-3">
          <div>
            <div className="text-[10px] tracking-wider opacity-80">VOUCHER CODE</div>
            <div className="font-mono text-lg font-bold tracking-[0.05em]">{code}</div>
          </div>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 rounded-[10px] bg-white px-3.5 py-2 text-xs font-bold text-[var(--brand)]"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="flex justify-between px-4 py-3 text-xs text-[var(--muted)]">
        <span>Earned {earned}</span>
        <span>Show at counter to redeem</span>
      </div>
    </div>
  );
}
