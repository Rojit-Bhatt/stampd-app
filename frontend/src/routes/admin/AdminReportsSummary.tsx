import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { apiRequest, getTenantSlug } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";

interface SummaryStats {
  newCustomers: number;
  stampsIssued: number;
  vouchersEarned: number;
  vouchersRedeemed: number;
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

  const { data: stats, isLoading } = useQuery<SummaryStats>({
    queryKey: ["adminReportsSummary", startDate, endDate],
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
    const slug = getTenantSlug();
    const res = await fetch(
      `/api/admin/reports/summary/download?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${token}`, ...(slug ? { "X-Tenant-Slug": slug } : {}) } },
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
    { label: "New customers", val: stats?.newCustomers ?? "—" },
    { label: "Stamps issued", val: stats?.stampsIssued ?? "—" },
    { label: "Vouchers earned", val: stats?.vouchersEarned ?? "—" },
    { label: "Vouchers redeemed", val: stats?.vouchersRedeemed ?? "—" },
    { label: "Total revenue", val: stats?.totalRevenue ?? "—" },
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
          <div key={c.label} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-2 text-[13px] text-[var(--muted)]">{c.label}</div>
            {isLoading ? (
              <Skeleton className="h-[26px] w-12" />
            ) : (
              <div className="font-display text-[26px] font-extrabold leading-none">{c.val}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
