import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, UserPlus, Coins, Gift, Hourglass, Wallet, Receipt } from "lucide-react";
import { apiRequest, tenantHeaders } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { Skeleton } from "../../components/ui/skeleton";

interface SummaryStats {
  newCustomers: number;
  transactions: number;
  pointsIssued: number;
  pointsRedeemed: number;
  pointsExpired: number;
  pointsOutstanding: number;
  totalRevenue: number;
  startDate: string;
  endDate: string;
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function AdminReportsSummary() {
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;

  const { data: stats, isLoading } = useQuery<SummaryStats>({
    queryKey: ["adminReportsSummary", orgId, startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean } & SummaryStats>(
        `/api/admin/reports/summary?startDate=${startDate}&endDate=${endDate}`,
        { role: "admin" },
      );
      return res;
    },
  });

  const download = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const res = await fetch(
      `/api/admin/reports/summary/download?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${token}`, ...tenantHeaders() } },
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "summary-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: "New customers", val: stats?.newCustomers ?? "—", Icon: UserPlus },
    { label: "Transactions", val: stats?.transactions ?? "—", Icon: Receipt },
    { label: "Points issued", val: stats?.pointsIssued ?? "—", Icon: Coins },
    { label: "Points redeemed", val: stats?.pointsRedeemed ?? "—", Icon: Gift },
    { label: "Points expired", val: stats?.pointsExpired ?? "—", Icon: Hourglass },
    { label: "Points outstanding", val: stats?.pointsOutstanding ?? "—", Icon: Wallet },
    { label: "Total revenue", val: stats?.totalRevenue ?? "—", Icon: Wallet },
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Summary report</h1>
      <p className="mb-6 text-[var(--muted)]">Business activity for the selected date range.</p>

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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
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
    </div>
  );
}
