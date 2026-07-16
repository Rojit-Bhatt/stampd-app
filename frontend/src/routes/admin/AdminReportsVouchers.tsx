import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Ticket, CheckCircle2, Clock, Percent } from "lucide-react";
import { apiRequest, getTenantSlug } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";

interface VoucherRow {
  voucherCode: string;
  earnedAt: string;
  redeemedAt: string | null;
  status: "redeemed" | "pending";
  daysToRedeem: number | null;
}

interface VoucherPerformanceStats {
  startDate: string;
  endDate: string;
  totalEarned: number;
  totalRedeemed: number;
  totalPending: number;
  redemptionRate: number;
  avgDaysToRedeem: number | null;
  rows: VoucherRow[];
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function AdminReportsVouchers() {
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);

  const { data: stats, isLoading } = useQuery<VoucherPerformanceStats>({
    queryKey: ["adminReportsVouchers", startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean } & VoucherPerformanceStats>(
        `/api/admin/reports/vouchers?startDate=${startDate}&endDate=${endDate}`,
        { role: "admin" },
      );
      return res;
    },
  });

  const download = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const slug = getTenantSlug();
    const res = await fetch(
      `/api/admin/reports/vouchers/download?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${token}`, ...(slug ? { "X-Tenant-Slug": slug } : {}) } },
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voucher-performance-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: "Vouchers earned", val: stats?.totalEarned ?? "—", Icon: Ticket },
    { label: "Redeemed", val: stats?.totalRedeemed ?? "—", Icon: CheckCircle2 },
    { label: "Redemption rate", val: stats ? `${stats.redemptionRate}%` : "—", Icon: Percent },
    { label: "Avg. days to redeem", val: stats?.avgDaysToRedeem ?? "—", Icon: Clock },
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Voucher performance</h1>
      <p className="mb-6 text-[var(--muted)]">
        How well rewards earned in this date range are actually being redeemed.
      </p>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
        </label>
        <button
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-[12px] px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          <Download className="h-4 w-4" /> Download Excel
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--surface-container)]">
              <c.Icon className="h-5 w-5" style={{ color: "var(--brand)" }} />
            </div>
            <div className="mb-1 text-[13px] uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            {isLoading ? (
              <Skeleton className="h-[26px] w-12" />
            ) : (
              <div className="font-display text-[26px] font-bold leading-none">{c.val}</div>
            )}
          </div>
        ))}
      </div>

      <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
        <h3 className="mb-4 font-display text-[17px] font-bold text-[var(--ink)]">Vouchers in this range</h3>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !stats || stats.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No vouchers were earned in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-[13px] uppercase tracking-wide text-[var(--muted)]">
                  <th className="pb-2 pr-4 font-bold">Voucher</th>
                  <th className="pb-2 pr-4 font-bold">Earned</th>
                  <th className="pb-2 pr-4 font-bold">Redeemed</th>
                  <th className="pb-2 pr-4 font-bold">Status</th>
                  <th className="pb-2 font-bold">Days to redeem</th>
                </tr>
              </thead>
              <tbody>
                {stats.rows.map((row) => (
                  <tr key={row.voucherCode} className="border-b border-[var(--line)] last:border-b-0">
                    <td className="py-2.5 pr-4 font-mono text-[13px]">{row.voucherCode}</td>
                    <td className="py-2.5 pr-4 text-[var(--muted)]">{row.earnedAt}</td>
                    <td className="py-2.5 pr-4 text-[var(--muted)]">{row.redeemedAt ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: row.status === "redeemed" ? "var(--ok-soft)" : "var(--warn-soft)",
                          color: row.status === "redeemed" ? "var(--ok)" : "var(--warn)",
                        }}
                      >
                        {row.status === "redeemed" ? "Redeemed" : "Pending"}
                      </span>
                    </td>
                    <td className="py-2.5 text-[var(--muted)]">{row.daysToRedeem ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
