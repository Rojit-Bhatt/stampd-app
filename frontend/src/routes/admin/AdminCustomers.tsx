import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Search, Download } from "lucide-react";
import { apiRequest, tenantHeaders } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { Skeleton } from "../../components/ui/skeleton";

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
}

function lastVisit(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminCustomers() {
  const { slug } = useParams();
  const { data: settings } = useAdminSettings();
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  const [query, setQuery] = useState("");

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
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [customers, query]);

  const downloadExcel = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const res = await fetch("/api/admin/reports/customers/download", {
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
          <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Customers</h1>
          <div className="text-[var(--muted)]">
            {isLoading ? <Skeleton className="inline-block h-4 w-40 align-middle" /> : `${customers.length} member${customers.length === 1 ? "" : "s"} of ${settings?.name ?? "your business"}`}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-full bg-[var(--surface-container)] px-4 py-2.5">
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
            className="stamp-interactive flex items-center gap-1.5 rounded-full bg-[var(--surface-container)] px-4 py-2.5 text-sm font-bold text-[var(--ink)]"
          >
            <Download className="h-4 w-4" />
            Export to Excel
          </button>
        </div>
      </div>

      <div className="shadow-ambient overflow-hidden rounded-3xl bg-[var(--surface)]">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Customer</span>
          <span>No.</span>
          <span>Points</span>
          <span>Redeemed</span>
          <span>Last visit</span>
        </div>

        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 items-center border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
              <span className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
                <span className="flex-1">
                  <Skeleton className="mb-1.5 h-3.5 w-24" />
                  <Skeleton className="h-3 w-32" />
                </span>
              </span>
              <Skeleton className="h-3.5 w-14" />
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
              to={`/${slug}/admin/customers/${c.id}`}
              className="grid w-full grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 items-center border-b border-[var(--line)] px-5 py-3.5 text-left last:border-b-0 hover:bg-[var(--surface-container)]"
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
              <span className="text-sm font-semibold">
                {c.pointsBalance}
              </span>
              <span className="text-sm font-semibold">{c.redemptionCount}</span>
              <span className="text-[13px] text-[var(--muted)]">{lastVisit(c.lastActivityAt)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
