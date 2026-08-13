import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ChevronUp, ChevronDown } from "lucide-react";
import { apiRequest, apiUrl } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";

interface PlatformCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  companyName: string;
  companySlug: string;
  outletName: string;
  outletSlug: string;
  points: number;
  tier: string | null;
  redemptionCount: number;
  joinedAt: string;
  lastActivityAt: string | null;
}

type SortKey =
  | "name"
  | "email"
  | "companyName"
  | "outletName"
  | "points"
  | "redemptionCount"
  | "tier"
  | "joinedAt"
  | "emailVerified";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

// Sort direction follows the same contract as the outlet console's sortable
// tables: asc → desc → null (original insertion order). "Original" is the
// freshest-first network order, not alphabetical — newest sign-ups lead.
function cycleSort(key: SortKey, sortKey: SortKey | null, sortDir: "asc" | "desc" | null) {
  if (sortKey !== key) return { sortKey: key, sortDir: "asc" as const };
  if (sortDir === "asc") return { sortKey: key, sortDir: "desc" as const };
  return { sortKey: null, sortDir: null };
}

function cmpRows(
  a: PlatformCustomer,
  b: PlatformCustomer,
  key: SortKey,
  dir: "asc" | "desc",
): number {
  let cmp = 0;
  if (key === "points" || key === "redemptionCount") {
    cmp = a[key] - b[key];
  } else if (key === "name" || key === "email" || key === "companyName" || key === "outletName") {
    cmp = a[key].toLowerCase().localeCompare(b[key].toLowerCase());
  } else if (key === "joinedAt") {
    cmp = new Date(a[key]).getTime() - new Date(b[key]).getTime();
  } else if (key === "tier") {
    cmp = (a.tier || "").toLowerCase().localeCompare((b.tier || "").toLowerCase());
  } else if (key === "emailVerified") {
    cmp = Number(a.emailVerified) - Number(b.emailVerified);
  }
  return dir === "desc" ? -cmp : cmp;
}

export default function PlatformCustomers() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  // Debounce the live text into the actual server search so every keystroke
  // doesn't trigger a fresh list fetch (same pattern as PlatformCompanies).
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useQuery<{
    rows: PlatformCustomer[]; total: number; truncated: boolean; search: string;
  }>({
    queryKey: ["platformCustomers", search],
    queryFn: async () => {
      const res = await apiRequest<{
        success: boolean; rows: PlatformCustomer[]; total: number; truncated: boolean; search: string;
      }>(
        search.trim()
          ? `/api/platform/customers?search=${encodeURIComponent(search.trim())}`
          : "/api/platform/customers",
        { role: "platform" },
      );
      return res;
    },
  });

  const rows = data?.rows || [];
  const truncated = data?.truncated || false;

  const displayed = useMemo(() => {
    if (sortKey === null || sortDir === null) return rows;
    return [...rows].sort((a, b) => cmpRows(a, b, sortKey, sortDir));
  }, [rows, sortKey, sortDir]);

  const onHeaderClick = (key: SortKey) => {
    const next = cycleSort(key, sortKey, sortDir);
    setSortKey(next.sortKey);
    setSortDir(next.sortDir);
  };

  const headerClass = (key: SortKey) =>
    `stamp-interactive select-none px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] ${
      sortKey === key ? "text-[var(--ink)]" : "text-[var(--soft)] hover:text-[var(--ink)]"
    }`;

  const downloadReport = async () => {
    const token = localStorage.getItem("platform_auth_token");
    const res = await fetch(
      apiUrl(`/api/platform/customers/report/download${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.015em] text-[var(--ink)]">Customers</h1>
          <p className="mb-6 text-[var(--muted)]">
            Every customer registered to the platform — verified and unverified,
            with or without an outlet membership.
          </p>
        </div>
        <Button
          onClick={downloadReport}
          disabled={isLoading || rows.length === 0}
          variant="outline"
          className="gap-2 border-[var(--line)] text-[var(--ink)]"
        >
          <Download className="h-4 w-4" />
          Export Excel
        </Button>
      </div>

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search by name, email, phone, company or outlet…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-[var(--line)] bg-[var(--surface)]"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full bg-[var(--surface)]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 py-10 text-center text-[var(--muted)]">
          {query.trim() ? "No customers match that search." : "No customers registered yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={headerClass("name")} onClick={() => onHeaderClick("name")}>
                  <span className="inline-flex items-center gap-1">Customer<SortIcon active={sortKey === "name"} dir={sortKey === "name" ? sortDir : null} /></span>
                </th>
                <th className={headerClass("email")} onClick={() => onHeaderClick("email")}>
                  <span className="inline-flex items-center gap-1">Email<SortIcon active={sortKey === "email"} dir={sortKey === "email" ? sortDir : null} /></span>
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--soft)]">Phone</th>
                <th className={headerClass("companyName")} onClick={() => onHeaderClick("companyName")}>
                  <span className="inline-flex items-center gap-1">Company<SortIcon active={sortKey === "companyName"} dir={sortKey === "companyName" ? sortDir : null} /></span>
                </th>
                <th className={headerClass("outletName")} onClick={() => onHeaderClick("outletName")}>
                  <span className="inline-flex items-center gap-1">Outlet<SortIcon active={sortKey === "outletName"} dir={sortKey === "outletName" ? sortDir : null} /></span>
                </th>
                <th className={headerClass("points")} onClick={() => onHeaderClick("points")}>
                  <span className="inline-flex items-center gap-1">Points<SortIcon active={sortKey === "points"} dir={sortKey === "points" ? sortDir : null} /></span>
                </th>
                <th className={headerClass("redemptionCount")} onClick={() => onHeaderClick("redemptionCount")}>
                  <span className="inline-flex items-center gap-1">Redeems<SortIcon active={sortKey === "redemptionCount"} dir={sortKey === "redemptionCount" ? sortDir : null} /></span>
                </th>
                <th className={headerClass("tier")} onClick={() => onHeaderClick("tier")}>
                  <span className="inline-flex items-center gap-1">Tier<SortIcon active={sortKey === "tier"} dir={sortKey === "tier" ? sortDir : null} /></span>
                </th>
                <th className={headerClass("joinedAt")} onClick={() => onHeaderClick("joinedAt")}>
                  <span className="inline-flex items-center gap-1">Joined<SortIcon active={sortKey === "joinedAt"} dir={sortKey === "joinedAt" ? sortDir : null} /></span>
                </th>
                <th className={headerClass("emailVerified")} onClick={() => onHeaderClick("emailVerified")}>
                  <span className="inline-flex items-center gap-1">Verified<SortIcon active={sortKey === "emailVerified"} dir={sortKey === "emailVerified" ? sortDir : null} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((r) => (
                <tr key={r.id} className="border-b border-[var(--line)] last:border-b-0">
                  <td className="max-w-[200px] px-3 py-2.5">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block truncate text-[12px] text-[var(--muted)]">{r.email}</span>
                  </td>
                  <td className="max-w-[190px] px-3 py-2.5 text-[13px]">{r.email}</td>
                  <td className="px-3 py-2.5 text-[13px]">{r.phone || "—"}</td>
                  <td className="px-3 py-2.5 text-[13px]">{r.companyName || "—"}</td>
                  <td className="px-3 py-2.5 text-[13px]">{r.outletName || "—"}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums">{r.points.toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--muted)]">{r.redemptionCount}</td>
                  <td className="px-3 py-2.5 text-[13px]">{r.tier || "Untiered"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[var(--muted)]">{fmtDate(r.joinedAt)}</td>
                  <td className="px-3 py-2.5">
                    {r.emailVerified ? (
                      <span className="rounded-full bg-[var(--ok)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--ok)]">Yes</span>
                    ) : (
                      <span className="rounded-full bg-[var(--muted)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--muted)]">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {truncated && (
        <p className="mt-3 text-[12px] text-[var(--muted)]">
          Showing the newest 1,000 of {rows.length.toLocaleString()} — export the full list to see everyone.
        </p>
      )}
    </div>
  );
}

// Sorted column header shows its direction; unsorted ones stay quiet — the
// same contract as the outlet console's sortable tables (asc → desc → original).
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" | null }) {
  if (!active || dir === null) return null;
  const Icon = dir === "asc" ? ChevronUp : ChevronDown;
  return <Icon className="h-3.5 w-3.5 shrink-0" />;
}
