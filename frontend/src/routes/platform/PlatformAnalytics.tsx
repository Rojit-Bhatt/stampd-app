import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Download } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { apiRequest, apiUrl } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";
import { DateRangeFilter, defaultDateRange, type DateRangeValue } from "../../components/shared/DateRangeFilter";
import { Button } from "@/components/ui/button";

interface DashboardMetric {
  value: number;
  trend: number | null;
}

interface PlatformAnalyticsData {
  companiesTotal: number;
  outletsTotal: number;
  outletsActive: number;
  customersTotal: number;
  newCustomers: DashboardMetric;
  pointsIssued: DashboardMetric;
  revenue: DashboardMetric;
  redemptions: DashboardMetric;
  pointsVelocity: { date: string; points: number }[];
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function TrendBadge({ trend }: { trend: number | null }) {
  if (trend === null) return null;
  const up = trend >= 0;
  return (
    <span className="ml-2 inline-flex items-center gap-0.5 text-[12px] font-bold" style={{ color: up ? "var(--ok)" : "var(--err)" }}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {Math.abs(trend)}%
    </span>
  );
}

export default function PlatformAnalytics() {
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange(30));
  const { startDate, endDate } = range;

  const { data: stats, isLoading } = useQuery<PlatformAnalyticsData>({
    queryKey: ["platformAnalytics"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean } & PlatformAnalyticsData>(
        "/api/platform/analytics",
        { role: "platform" },
      );
      return res;
    },
  });

  // Point-in-time totals, not flows — no trend badge (see the backend's own
  // comment on why: they're snapshots, week-over-week doesn't mean anything
  // for a running total).
  const totalTiles = stats
    ? [
        { label: "Companies", val: stats.companiesTotal },
        { label: "Outlets", val: `${stats.outletsActive}/${stats.outletsTotal}` },
        { label: "Customers", val: stats.customersTotal },
      ]
    : [];

  const trendTiles = stats
    ? [
        { label: "New customers (7d)", val: stats.newCustomers.value, trend: stats.newCustomers.trend },
        { label: "Points issued (7d)", val: stats.pointsIssued.value, trend: stats.pointsIssued.trend },
        { label: "Revenue (7d)", val: `Rs ${stats.revenue.value.toLocaleString("en-IN")}`, trend: stats.revenue.trend },
        { label: "Redemptions (7d)", val: stats.redemptions.value, trend: stats.redemptions.trend },
      ]
    : [];

  const downloadCompaniesReport = async () => {
    const token = localStorage.getItem("platform_auth_token");
    const res = await fetch(
      apiUrl(`/api/platform/analytics/companies-report/download?startDate=${startDate}&endDate=${endDate}`),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "companies-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Analytics</h1>
      <p className="mb-6 text-[var(--muted)]">Rolled up across every business on the platform.</p>

      {/* TWO METRIC FAMILIES, DRAWN DIFFERENTLY ON PURPOSE.
          Point-in-time totals answer "how much exists"; weekly flows answer
          "how fast is it moving". They were previously identical cards
          distinguished only by whether a trend badge happened to be present,
          which is what made the two kinds of number get read as one. */}
      <section className="mb-7">
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
            Right now
          </h2>
          <span className="text-[11px] text-[var(--soft)]">snapshot totals — no trend</span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
                  <Skeleton className="mb-2 h-3 w-20" />
                  <Skeleton className="h-8 w-12" />
                </div>
              ))
            : totalTiles.map((t) => (
                <div
                  key={t.label}
                  className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5"
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
                    {t.label}
                  </div>
                  <div className="mt-1.5 font-numeral text-[34px] leading-none text-[var(--ink)]">
                    {t.val}
                  </div>
                </div>
              ))}
        </div>
      </section>

      <section className="mb-7">
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
            This week
          </h2>
          <span className="text-[11px] text-[var(--soft)]">flow — week over week</span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-[var(--radius-card)] bg-[var(--surface)] p-5 pl-6">
                  <Skeleton className="mb-2 h-3 w-24" />
                  <Skeleton className="h-8 w-14" />
                </div>
              ))
            : trendTiles.map((t) => (
                <div
                  key={t.label}
                  className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 pl-6"
                >
                  {/* The green left tab is the family marker — a flow metric
                      is something moving, and moving is what green means. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1 bg-[var(--primary)]"
                  />
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
                    {t.label}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-numeral text-[34px] leading-none text-[var(--ink)]">
                      {t.val}
                    </span>
                    <TrendBadge trend={t.trend} />
                  </div>
                </div>
              ))}
        </div>
      </section>

      <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <h3 className="mb-1 font-display text-lg font-bold text-[var(--ink)]">Company report</h3>
        <p className="mb-4 text-[13px] text-[var(--muted)]">
          One row per company for the selected range — new customers, points issued/redeemed, revenue, redemptions.
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <DateRangeFilter value={range} onChange={setRange} />
          <Button onClick={downloadCompaniesReport}>
            <Download /> Download Excel
          </Button>
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <h3 className="mb-1 font-display text-lg font-bold text-[var(--ink)]">Points velocity</h3>
        <p className="mb-4 text-[13px] text-[var(--muted)]">Points issued per day across every business, last 14 days.</p>
        {isLoading || !stats ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.pointsVelocity.map((d) => ({ ...d, label: shortDate(d.date) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--soft)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--soft)" />
              <Tooltip />
              <Line type="monotone" dataKey="points" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
