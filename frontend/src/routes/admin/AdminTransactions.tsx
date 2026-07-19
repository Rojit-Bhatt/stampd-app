import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Coins, Gift, Hourglass, Download } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest, apiUrl, tenantHeaders } from "../../lib/api";
import { useTenant } from "../../context/TenantContext";
import { tenantPath } from "../../lib/tenantPath";
import { formatPoints, type PointsTransaction } from "../../hooks/usePoints";
import { formatNpr } from "../../lib/subscription";
import { Skeleton } from "../../components/ui/skeleton";
import { DateRangeFilter, defaultDateRange, type DateRangeValue } from "../../components/shared/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminTransaction extends PointsTransaction {
  customerId: string;
  customerName: string;
}

type TypeFilter = "all" | "earn" | "redeem" | "expire";

const TYPE_META: Record<PointsTransaction["type"], { label: string; Icon: typeof Coins; tone: string }> = {
  earn: { label: "Earn", Icon: Coins, tone: "var(--ok)" },
  redeem: { label: "Redeem", Icon: Gift, tone: "var(--brand)" },
  expire: { label: "Expire", Icon: Hourglass, tone: "var(--soft)" },
};

function useTransactions(range: DateRangeValue) {
  const { companySlug, outletSlug } = useTenant();
  return useQuery<AdminTransaction[]>({
    queryKey: ["adminTransactions", companySlug, outletSlug, range.startDate, range.endDate],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: AdminTransaction[] }>(
        `/api/admin/transactions?startDate=${range.startDate}&endDate=${range.endDate}`,
        { role: "admin" },
      );
      return res.data || [];
    },
  });
}

// The outlet's ledger, straight through. Every points movement is one
// immutable row on the server — a correction is a new row, never an edit —
// so this page never offers to change anything.
export default function AdminTransactions() {
  const { companySlug, outletSlug } = useTenant();
  const [range, setRange] = useState<DateRangeValue>(defaultDateRange(30));
  const { data: rows = [], isLoading } = useTransactions(range);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [downloading, setDownloading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (!q) return true;
      return r.customerName.toLowerCase().includes(q) || (r.rewardName || "").toLowerCase().includes(q);
    });
  }, [rows, query, type]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(
        apiUrl(`/api/admin/reports/transactions/download?startDate=${range.startDate}&endDate=${range.endDate}`),
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("admin_auth_token")}`,
            ...tenantHeaders(),
          },
        },
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transactions-report.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't download that — try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Transactions</h1>
          <p className="text-[var(--muted)]">Every point earned, spent, or expired here.</p>
        </div>
        <Button onClick={download} disabled={downloading || rows.length === 0} variant="outline">
          <Download />
          {downloading ? "Preparing…" : "Export"}
        </Button>
      </div>

      <div className="mb-4">
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--soft)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by customer or reward…"
            className="pl-10"
          />
        </div>
        <div className="flex gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1">
          {(["all", "earn", "redeem", "expire"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-bold capitalize transition-colors"
              style={type === t ? { background: "var(--primary)", color: "white" } : { color: "var(--muted)" }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="grid grid-cols-[1.6fr_1fr_1.4fr_1fr_1fr] border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Customer</span>
          <span>Type</span>
          <span>Detail</span>
          <span className="text-right">Points</span>
          <span className="text-right">Balance</span>
        </div>

        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[1.6fr_1fr_1.4fr_1fr_1fr] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="ml-auto h-3.5 w-10" />
              <Skeleton className="ml-auto h-3.5 w-10" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">
            {rows.length === 0 ? "No transactions yet." : "Nothing matches that search."}
          </div>
        ) : (
          filtered.map((r) => {
            const { label, Icon, tone } = TYPE_META[r.type];
            return (
              <div
                key={r.id}
                className="grid grid-cols-[1.6fr_1fr_1.4fr_1fr_1fr] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 text-sm last:border-b-0"
              >
                <span className="min-w-0">
                  <Link
                    to={tenantPath(companySlug, outletSlug, `admin/customers/${r.customerId}`)}
                    className="block truncate font-bold hover:underline"
                  >
                    {r.customerName}
                  </Link>
                  <span className="block truncate text-xs text-[var(--soft)]">
                    {new Date(r.createdAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 font-semibold" style={{ color: tone }}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
                <span className="truncate text-[var(--muted)]">
                  {r.type === "earn" && r.billAmount != null
                    ? r.campaignName
                      ? `${formatNpr(r.billAmount)} · ${r.campaignName} (${r.multiplier}x)`
                      : formatNpr(r.billAmount)
                    : r.type === "redeem"
                      ? r.rewardName || "—"
                      : "inactivity"}
                </span>
                <span className="text-right font-bold" style={{ color: tone }}>
                  {r.points > 0 ? "+" : ""}
                  {formatPoints(r.points)}
                </span>
                <span className="text-right font-semibold text-[var(--muted)]">
                  {formatPoints(r.balanceAfter)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
