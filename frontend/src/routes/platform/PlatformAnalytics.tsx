import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";

interface DashboardMetric {
  value: number;
  trend: number | null;
}

interface PlatformAnalyticsData {
  businessesTotal: number;
  businessesActive: number;
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

  const tiles = stats
    ? [
        { label: "Businesses", val: `${stats.businessesActive}/${stats.businessesTotal}`, trend: null },
        { label: "New customers (7d)", val: stats.newCustomers.value, trend: stats.newCustomers.trend },
        { label: "Points issued (7d)", val: stats.pointsIssued.value, trend: stats.pointsIssued.trend },
        { label: "Revenue (7d)", val: stats.revenue.value, trend: stats.revenue.trend },
        { label: "Redemptions (7d)", val: stats.redemptions.value, trend: stats.redemptions.trend },
      ]
    : [];

  return (
    <div>
      <h1 className="font-display text-[30px] font-extrabold text-[var(--ink)]">Analytics</h1>
      <p className="mb-6 text-[var(--muted)]">Rolled up across every business on the platform.</p>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
                <Skeleton className="mb-1.5 h-3.5 w-20" />
                <Skeleton className="h-6 w-10" />
              </div>
            ))
          : tiles.map((t) => (
              <div key={t.label} className="shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
                <div className="mb-1.5 text-[13px] text-[var(--muted)]">{t.label}</div>
                <div className="font-display text-[26px] font-bold">
                  {t.val}
                  <TrendBadge trend={t.trend} />
                </div>
              </div>
            ))}
      </div>

      <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
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
              <Line type="monotone" dataKey="points" stroke="var(--plat)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
