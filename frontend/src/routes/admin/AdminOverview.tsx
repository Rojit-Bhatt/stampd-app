import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Coins,
  Gift,
  Search,
  Download,
  TrendingUp,
  TrendingDown,
  Hourglass,
  QrCode,
  TicketCheck,
  Zap,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { apiRequest, apiUrl, tenantHeaders } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useCampaigns } from "../../hooks/useCampaigns";
import { formatPoints } from "../../hooks/usePoints";
import { tenantPath } from "../../lib/tenantPath";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  customerNo: string;
  pointsBalance: number;
  lifetimePoints: number;
  lastActivityAt: string | null;
}
interface LedgerRow {
  id: string;
  createdAt: string;
  customerName: string;
  type: "earn" | "redeem" | "expire";
  points: number;
  billAmount: number | null;
  rewardName: string;
}
interface DashboardMetric {
  value: number;
  trend: number | null;
}
interface DashboardStats {
  newCustomers: DashboardMetric;
  pointsIssued: DashboardMetric;
  revenue: DashboardMetric;
  /** A snapshot (points sitting in balances), so it carries no trend. */
  pointsOutstanding: DashboardMetric;
  pointsVelocity: { date: string; points: number }[];
  pointsActivity: { weekStart: string; earned: number; redeemed: number }[];
}

// Chart-only categorical pair — kept distinct from the identity/status tokens,
// which are not series colors. Validated for chroma, CVD separation and
// contrast against a white card rather than picked by eye.
const CHART_EARNED_COLOR = "#A8632E";
const CHART_REDEEMED_COLOR = "#1A6E99";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function lastVisit(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** A card on the hub. */
function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[17px] font-bold text-[var(--ink)]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// The outlet console's hub. The two counter actions are the hero — they're
// what staff open this console to do — and everything else is a report on how
// the outlet is doing.
export default function AdminOverview() {
  const { companySlug = "", outletSlug = "" } = useParams();
  const slug = outletSlug;
  const { data: settings } = useAdminSettings();
  const { data: campaigns = [] } = useCampaigns();
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  const [query, setQuery] = useState("");

  const liveCampaign = campaigns
    .filter((c) => c.isLive)
    .reduce<(typeof campaigns)[number] | null>(
      (best, c) => (!best || c.multiplier > best.multiplier ? c : best),
      null,
    );

  const { data: customers = [] } = useQuery<AdminCustomer[]>({
    queryKey: ["adminCustomers", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: AdminCustomer[] }>(
        "/api/admin/customers",
        { role: "admin" },
      );
      return res.data || [];
    },
  });

  // The outlet ledger doubles as the live feed — same rows the Transactions
  // page shows, just the newest few.
  const { data: ledger = [] } = useQuery<LedgerRow[]>({
    queryKey: ["adminTransactions", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: LedgerRow[] }>("/api/admin/transactions", {
        role: "admin",
      });
      return res.data || [];
    },
    refetchInterval: 5000,
  });

  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ["adminDashboardStats", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean } & DashboardStats>("/api/admin/dashboard-stats", {
        role: "admin",
      });
      return res;
    },
  });

  // Flow metrics move week to week and carry a trend. `pointsOutstanding` is a
  // snapshot of what's sitting in balances right now — "how much exists", not
  // "how fast it's moving" — so it deliberately gets no trend badge. Drawing
  // them identically is what makes the two kinds of number get confused.
  const flowKpis: { label: string; metric?: DashboardMetric; format?: (v: number) => string }[] = [
    { label: "New customers · 7d", metric: dashboardStats?.newCustomers },
    { label: "Points issued · 7d", metric: dashboardStats?.pointsIssued, format: formatPoints },
    { label: "Revenue · 7d", metric: dashboardStats?.revenue, format: (v) => `Rs ${v.toLocaleString("en-IN")}` },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      : customers;
    return base.slice(0, 5);
  }, [customers, query]);

  const downloadExcel = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const res = await fetch(apiUrl("/api/admin/reports/customers/download"), {
      headers: { Authorization: `Bearer ${token}`, ...tenantHeaders() },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-[28px] font-bold leading-tight text-[var(--ink)]">
          {greeting()}
          {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {today} · {settings?.name ?? "your outlet"}
        </p>
      </header>

      {/* A live multiplier changes what every bill is worth, so staff need to
          see it before they quote anyone a number. */}
      {liveCampaign && (
        <div className="flex items-center gap-2.5 rounded-[var(--radius-btn)] bg-[var(--primary-soft)] px-4 py-3">
          <Zap className="h-4 w-4 flex-shrink-0 text-[var(--primary-deep)]" />
          <span className="text-sm font-bold text-[var(--primary-deep)]">
            {liveCampaign.multiplier}× points live — {liveCampaign.name}
          </span>
        </div>
      )}

      {/* The hero. These two are the job; everything below is reporting. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to={tenantPath(companySlug, slug, "admin/generate")}
          className="stamp-interactive group relative overflow-hidden rounded-[var(--radius-card)] border-[1.5px] border-[var(--primary)] bg-[var(--surface)] p-5"
        >
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 h-0 w-0 border-l-[28px] border-t-[28px] border-l-transparent border-t-[var(--primary)]"
          />
          <QrCode className="h-6 w-6 text-[var(--primary)]" strokeWidth={1.75} />
          <div className="mt-3 font-display text-base font-bold text-[var(--ink)]">Earn code</div>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Enter a bill, show the QR. The screen you'll use most.
          </p>
        </Link>

        <Link
          to={tenantPath(companySlug, slug, "admin/redeem")}
          className="stamp-interactive rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <TicketCheck className="h-6 w-6 text-[var(--ink)]" strokeWidth={1.75} />
          <div className="mt-3 font-display text-base font-bold text-[var(--ink)]">Redeem</div>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Put up a redeem QR — the customer picks their reward.
          </p>
        </Link>
      </div>

      {/* Flow metrics: hairline-ruled, serif numerals, week-over-week trend. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {flowKpis.map((s) => (
          <div key={s.label} className="border-t border-[var(--line)] pt-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
              {s.label}
            </div>
            <div className="mt-1 font-numeral text-[32px] leading-none text-[var(--ink)]">
              {s.metric ? (s.format ? s.format(s.metric.value) : s.metric.value) : "—"}
            </div>
            {s.metric?.trend !== null && s.metric?.trend !== undefined && (
              <span
                className="mt-1 flex items-center gap-0.5 text-[11px] font-bold"
                style={{ color: s.metric.trend >= 0 ? "var(--primary-deep)" : "var(--err)" }}
              >
                {s.metric.trend >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(s.metric.trend)}%
              </span>
            )}
          </div>
        ))}

        {/* Drawn differently on purpose — a snapshot, with no trend to show. */}
        <div className="border-t border-[var(--line)] pt-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
            Points outstanding
          </div>
          <div className="mt-1 font-numeral text-[32px] leading-none text-[var(--ink)]">
            {dashboardStats ? formatPoints(dashboardStats.pointsOutstanding.value) : "—"}
          </div>
          <span className="mt-1 block text-[11px] text-[var(--soft)]">right now</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Points velocity" subtitle="Points issued per day, last 14 days.">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dashboardStats?.pointsVelocity ?? []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                labelFormatter={(v) => shortDate(String(v))}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="points"
                name="Points"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Points activity" subtitle="Earned vs. redeemed per week, last 8 weeks.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={dashboardStats?.pointsActivity ?? []}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="weekStart"
                tickFormatter={shortDate}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                labelFormatter={(v) => shortDate(String(v))}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="earned" name="Earned" fill={CHART_EARNED_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="redeemed" name="Redeemed" fill={CHART_REDEEMED_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel
        title="Customers"
        subtitle="The five most recent. Search to find anyone."
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--soft)]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search customers"
                className="h-9 w-40 pl-9 text-sm"
              />
            </div>
            <Button onClick={downloadExcel} variant="outline" size="sm">
              <Download />
              Export
            </Button>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            {query ? "No customers match your search." : "No customers yet."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  // Both slugs. An outlet slug alone can't identify an outlet,
                  // so this used to build a path that resolved elsewhere.
                  to={tenantPath(companySlug, slug, `admin/customers/${c.id}`)}
                  className="-mx-2 flex items-center gap-3 rounded-[var(--radius-field)] border-b border-[var(--line)] px-2 py-3 transition-colors last:border-b-0 hover:bg-[var(--surface-2)]"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-bold text-[var(--muted)]">
                    {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--ink)]">{c.name}</span>
                    <span className="block truncate text-xs text-[var(--soft)]">{c.email}</span>
                  </span>
                  <span className="font-numeral text-lg leading-none text-[var(--ink)]">
                    {formatPoints(c.pointsBalance)}
                  </span>
                  <span className="hidden w-20 text-right text-[13px] text-[var(--muted)] sm:block">
                    {lastVisit(c.lastActivityAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link
          to={tenantPath(companySlug, slug, "admin/customers")}
          className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--primary-deep)] hover:underline"
        >
          View all customers <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Panel>

      <Panel title="Live activity" subtitle="Updates as customers scan at the counter.">
        {ledger.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            No activity yet. Points appear here as customers scan at the counter.
          </p>
        ) : (
          <ul className="flex flex-col">
            {ledger.slice(0, 12).map((row) => {
              const Icon = row.type === "earn" ? Coins : row.type === "redeem" ? Gift : Hourglass;
              const earn = row.type === "earn";
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 border-b border-[var(--line)] py-3 last:border-b-0"
                >
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: earn ? "var(--primary-soft)" : "var(--surface-2)",
                      color: earn ? "var(--primary-deep)" : "var(--muted)",
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <b>{row.customerName || "A customer"}</b>{" "}
                    {row.type === "earn"
                      ? `earned ${formatPoints(row.points)} points`
                      : row.type === "redeem"
                        ? `redeemed ${row.rewardName || "a reward"}`
                        : `lost ${formatPoints(Math.abs(row.points))} points to expiry`}
                  </span>
                  <span className="flex-shrink-0 text-xs text-[var(--soft)]">
                    {timeAgo(row.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
