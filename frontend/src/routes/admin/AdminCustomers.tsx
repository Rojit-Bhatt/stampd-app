import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Download, Trophy } from "lucide-react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { apiRequest, apiUrl, tenantHeaders } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useTenant } from "../../context/TenantContext";
import { tenantPath } from "../../lib/tenantPath";
import { Skeleton } from "../../components/ui/skeleton";
import { Badge } from "../../components/ui/badge";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import type { LeaderboardRow, LeaderboardWindow } from "../../hooks/usePoints";

interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  customerNo: string;
  phone: string;
  address: string;
  pointsBalance: number;
  lifetimePoints: number;
  lastActivityAt: string | null;
  redemptionCount: number;
  totalSpent: number;
  history: { id: string; type: string; points: number; createdAt: string }[];
  /** Null when the outlet has no tier thresholds configured, or none are met. */
  tier: string | null;
}

function lastVisit(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminCustomers() {
  const { companySlug, outletSlug } = useTenant();
  const { data: settings } = useAdminSettings();
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  const [query, setQuery] = useState("");
  const [leaderboardWindow, setLeaderboardWindow] = useState<LeaderboardWindow>("all");
  type SortKey = "name" | "pointsBalance" | "redemptionCount" | "lastActivityAt";
  type SortDir = "asc" | "desc" | null; // null = original server order
  const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /** Cycle: current-key asc -> current-key desc -> reset (original order). */
  const cycleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        // Reset to default ordering: most recent first
        setSortKey("lastActivityAt");
        setSortDir("desc");
      } else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const { data: leaderboard = [], isLoading: leaderboardLoading } = useQuery<LeaderboardRow[]>({
    queryKey: ["adminLeaderboard", orgId, leaderboardWindow],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: { rows: LeaderboardRow[] } }>(
        `/api/admin/leaderboard?window=${leaderboardWindow}`,
        { role: "admin" },
      );
      return res.data?.rows || [];
    },
  });

  const { data: customers = [], isLoading } = useQuery<AdminCustomer[]>({
    queryKey: ["adminCustomers", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: AdminCustomer[] }>(
        "/api/admin/customers",
        { role: "admin" },
      );
      return res.data || [];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
        )
      : customers;
    if (!sortDir) return list;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "pointsBalance") cmp = a.pointsBalance - b.pointsBalance;
      else if (sortKey === "redemptionCount") cmp = a.redemptionCount - b.redemptionCount;
      else cmp = (a.lastActivityAt || "").localeCompare(b.lastActivityAt || "");
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [customers, query, sortKey, sortDir]);

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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.015em] text-[var(--ink)]">Customers</h1>
          <div className="text-[var(--muted)]">
            {isLoading ? <Skeleton className="inline-block h-4 w-40 align-middle" /> : `${customers.length} member${customers.length === 1 ? "" : "s"} of ${settings?.name ?? "your business"}`}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-4 py-2.5">
            <Search className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers…"
              className="w-40 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
            />
          </div>
          <button
            onClick={downloadExcel}
            className="stamp-interactive flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-4 py-2.5 text-sm font-bold text-[var(--ink)]"
          >
            <Download className="h-4 w-4" />
            Export to Excel
          </button>
        </div>
      </div>

      <div className="shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Customer</span>
          <span>No.</span>
          <span>Tier</span>
          <button
            type="button"
            onClick={() => cycleSort("pointsBalance")}
            className={`stamp-interactive flex items-center gap-1 text-left ${sortKey === "pointsBalance" && sortDir ? "text-[var(--ink)]" : "hover:text-[var(--ink)]"}`}
            aria-label={`Sort by points, currently ${sortKey === "pointsBalance" ? (sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : "original order") : "unsorted"}`}
          >
            Points
            {sortKey === "pointsBalance" ? (
              sortDir === "asc" ? (
                <ArrowUp className="h-3 w-3" aria-hidden />
              ) : sortDir === "desc" ? (
                <ArrowDown className="h-3 w-3" aria-hidden />
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />
              )
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => cycleSort("redemptionCount")}
            className={`stamp-interactive flex items-center gap-1 text-left ${sortKey === "redemptionCount" && sortDir ? "text-[var(--ink)]" : "hover:text-[var(--ink)]"}`}
            aria-label={`Sort by redemptions, currently ${sortKey === "redemptionCount" ? (sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : "original order") : "unsorted"}`}
          >
            Redeemed
            {sortKey === "redemptionCount" ? (
              sortDir === "asc" ? (
                <ArrowUp className="h-3 w-3" aria-hidden />
              ) : sortDir === "desc" ? (
                <ArrowDown className="h-3 w-3" aria-hidden />
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />
              )
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => cycleSort("lastActivityAt")}
            className={`stamp-interactive flex items-center gap-1 text-left ${sortKey === "lastActivityAt" && sortDir ? "text-[var(--ink)]" : "hover:text-[var(--ink)]"}`}
            aria-label={`Sort by last visit, currently ${sortKey === "lastActivityAt" ? (sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : "original order") : "unsorted"}`}
          >
            Last visit
            {sortKey === "lastActivityAt" ? (
              sortDir === "asc" ? (
                <ArrowUp className="h-3 w-3" aria-hidden />
              ) : sortDir === "desc" ? (
                <ArrowDown className="h-3 w-3" aria-hidden />
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />
              )
            ) : null}
          </button>
        </div>

        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 items-center border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
              <span className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
                <span className="flex-1">
                  <Skeleton className="mb-1.5 h-3.5 w-24" />
                  <Skeleton className="h-3 w-32" />
                </span>
              </span>
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-3.5 w-8" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))
        ) : customers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">No customers yet.</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">No customers match "{query}".</div>
        ) : (
          filtered.map((c) => (
            <Link
              key={c.id}
              to={tenantPath(companySlug, outletSlug, `admin/customers/${c.id}`)}
              className="grid w-full grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 items-center border-b border-[var(--line)] px-5 py-3.5 text-left last:border-b-0 hover:bg-[var(--surface-2)]"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg)] text-xs font-bold text-[var(--muted)]">
                  {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[var(--ink)]">{c.name}</span>
                  <span className="block truncate text-xs text-[var(--soft)]">{c.email}</span>
                </span>
              </span>
              <span className="font-mono text-[13px] text-[var(--muted)]">{c.customerNo}</span>
              <span>{c.tier ? <Badge>{c.tier}</Badge> : <span className="text-[13px] text-[var(--soft)]">—</span>}</span>
              <span className="text-sm font-semibold">
                {c.pointsBalance}
              </span>
              <span className="text-sm font-semibold">{c.redemptionCount}</span>
              <span className="text-[13px] text-[var(--muted)]">{lastVisit(c.lastActivityAt)}</span>
            </Link>
          ))
        )}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-[var(--ink)]">Top Customer Leaderboard</h2>
          <SegmentedControl value={leaderboardWindow} onValueChange={(v) => setLeaderboardWindow(v as LeaderboardWindow)}>
            <SegmentedControlItem value="week">Week</SegmentedControlItem>
            <SegmentedControlItem value="month">Month</SegmentedControlItem>
            <SegmentedControlItem value="all">All time</SegmentedControlItem>
          </SegmentedControl>
        </div>

        <div className="shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
          {leaderboardLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-12" />
              </div>
            ))
          ) : leaderboard.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Trophy className="mx-auto h-6 w-6 text-[var(--soft)]" strokeWidth={1.5} />
              <p className="mt-3 text-sm text-[var(--muted)]">No one's earned points here yet.</p>
            </div>
          ) : (
            leaderboard.map((row) => (
              <div
                key={row.userId}
                className="flex items-center gap-4 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0"
              >
                <span className="w-6 flex-shrink-0 text-center font-numeral text-sm text-[var(--muted)]">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink)]">{row.name}</span>
                <span className="flex-shrink-0 text-sm font-semibold text-[var(--ink)]">{row.pointsEarned}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
