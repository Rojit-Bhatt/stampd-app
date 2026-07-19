import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, UserPlus, Coins, Gift, Hourglass, Wallet, Receipt } from "lucide-react";
import { apiRequest, apiUrl, tenantHeaders } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { Skeleton } from "../../components/ui/skeleton";
import { DateRangeFilter, defaultDateRange, type DateRangeValue } from "../../components/shared/DateRangeFilter";
import { Button } from "@/components/ui/button";

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

export default function AdminReportsSummary() {
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange(30));
  const { startDate, endDate } = range;
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
      apiUrl(`/api/admin/reports/summary/download?startDate=${startDate}&endDate=${endDate}`),
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
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Summary report</h1>
      <p className="mb-6 text-[var(--muted)]">Business activity for the selected date range.</p>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <Button onClick={download}>
          <Download /> Download Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--radius-btn)] bg-[var(--surface-2)]">
              <c.Icon className="h-5 w-5" style={{ color: "var(--primary-deep)" }} />
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
