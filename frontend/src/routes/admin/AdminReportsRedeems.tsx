import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, Coins, Gift, Users } from "lucide-react";
import { apiRequest, apiUrl, tenantHeaders } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";
import { DateRangeFilter, defaultDateRange, type DateRangeValue } from "../../components/shared/DateRangeFilter";
import { ScrollableTable } from "../../components/shared/ScrollableTable";
import { Button } from "@/components/ui/button";

interface RedeemStats {
  rows: { date: string; customer: string; item: string; points: number; value: number | null }[];
  totalRedemptions: number;
  totalPointsRedeemed: number;
  uniqueCustomers: number;
  topItem: string | null;
  daily: { date: string; redemptions: number; points: number }[];
  startDate: string;
  endDate: string;
}

export default function AdminReportsRedeems() {
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange(30));
  const { startDate, endDate } = range;

  const { data: stats, isLoading } = useQuery<RedeemStats>({
    queryKey: ["adminReportsRedeem", startDate, endDate],
    queryFn: async () =>
      apiRequest<{ success: boolean } & RedeemStats>(
        `/api/admin/reports/redeem?startDate=${startDate}&endDate=${endDate}`,
        { role: "admin" },
      ),
  });

  const download = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const res = await fetch(
      apiUrl(`/api/admin/reports/redeem/download?startDate=${startDate}&endDate=${endDate}`),
      { headers: { Authorization: `Bearer ${token}`, ...tenantHeaders() } },
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "redeem-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: "Total redemptions", val: stats?.totalRedemptions ?? "—", Icon: Gift },
    { label: "Points redeemed", val: stats?.totalPointsRedeemed ?? "—", Icon: Coins },
    { label: "Unique customers", val: stats?.uniqueCustomers ?? "—", Icon: Users },
    { label: "Top redeemed item", val: stats?.topItem ?? "—", Icon: Award },
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.015em] text-[var(--ink)]">Redeem report</h1>
      <p className="mb-6 text-[var(--muted)]">
        Every redemption in the outlet for the selected date range — who redeemed what, and how many points it cost.
      </p>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <Button onClick={download}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Download Excel
        </Button>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--radius-btn)] bg-[var(--surface-2)]">
              <c.Icon className="h-5 w-5" style={{ color: "var(--primary-deep)" }} />
            </div>
            <div className="mb-1 text-[13px] uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            {isLoading ? (
              <Skeleton className="h-[26px] w-12" />
            ) : (
              <div className="truncate font-display text-[26px] font-bold leading-none" title={String(c.val)}>
                {c.val}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
          <h2 className="mb-4 font-display text-[18px] font-bold text-[var(--ink)]">Redemptions per day</h2>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : !stats || stats.daily.length === 0 ? (
            <p className="py-8 text-center text-[var(--muted)]">No redemptions in this range.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[13px] uppercase tracking-wide text-[var(--muted)]">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Redemptions</th>
                    <th className="pb-2 font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.daily.map((d) => (
                    <tr key={d.date} className="border-b border-[var(--line)]/60 last:border-0">
                      <td className="py-2 pr-4">{d.date}</td>
                      <td className="py-2 pr-4">{d.redemptions}</td>
                      <td className="py-2">{d.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
          <h2 className="mb-4 font-display text-[18px] font-bold text-[var(--ink)]">Redemption history</h2>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !stats || stats.rows.length === 0 ? (
            <p className="py-8 text-center text-[var(--muted)]">No redemptions in this range.</p>
          ) : (
            <ScrollableTable minContentWidth="720px">
              <div className="mb-2 grid min-w-[720px] grid-cols-[1.9fr_1.6fr_1.8fr_1.2fr_1.2fr] gap-3 px-4 text-left text-[13px] font-medium uppercase tracking-wide text-[var(--muted)]">
                <span>When</span>
                <span>Customer</span>
                <span>Item / Reward</span>
                <span>Points</span>
                <span>Value (Rs)</span>
              </div>
              {stats.rows.map((r, i) => (
                <div
                  key={`${r.date}-${r.customer}-${i}`}
                  className="grid grid-cols-[1.9fr_1.6fr_1.8fr_1.2fr_1.2fr] items-center gap-3 border-t border-[var(--line)]/60 px-4 py-3 first:border-0"
                >
                  <span className="truncate text-[var(--ink)]">{r.date}</span>
                  <span className="truncate text-[var(--ink)]">{r.customer}</span>
                  <span className="truncate text-[var(--ink)]">{r.item || "—"}</span>
                  <span className="font-semibold text-[var(--primary-deep)]">{r.points} pts</span>
                  <span className="text-[var(--ink)]">{r.value != null ? `Rs ${r.value}` : "—"}</span>
                </div>
              ))}
            </ScrollableTable>
          )}
        </div>
      </div>
    </div>
  );
}
