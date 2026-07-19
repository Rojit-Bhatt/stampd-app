import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";
import type { BusinessCategory } from "../../hooks/useAdminSettings";
import { usePlatformAuth } from "../../context/PlatformAuthContext";

type StatusFilter = "all" | "active" | "suspended";

export interface Outlet {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "archived";
  category: BusinessCategory;
  branding: { primaryColor: string };
  customersCount: number;
  pointsIssued: number;
  redemptionCount: number;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  branding: { primaryColor: string };
  /** The values every outlet under this company inherits when it hasn't set its own. */
  programDefaults?: { earnPercent: number; pointsExpiryDays: number };
  owner: { name: string; email: string; emailVerified: boolean } | null;
  outlets: Outlet[];
  outletCount: number;
  customersCount: number;
  pointsIssued: number;
  redemptionCount: number;
}

export function useCompanies() {
  return useQuery<Company[]>({
    queryKey: ["platformCompanies"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; companies: Company[] }>(
        "/api/platform/companies",
        { role: "platform" },
      );
      return res.companies || [];
    },
  });
}

export default function Companies() {
  const navigate = useNavigate();
  const { user } = usePlatformAuth();
  const isOwner = user?.platformRole === "owner";
  const { data: companies = [], isLoading } = useCompanies();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const active = companies.filter((c) => c.status === "active").length;
  const totalOutlets = companies.reduce((n, c) => n + c.outletCount, 0);
  const totalCustomers = companies.reduce((n, c) => n + c.customersCount, 0);

  const stats = [
    { label: "Companies", val: companies.length },
    { label: "Active", val: active },
    { label: "Outlets", val: totalOutlets },
    { label: "Customers", val: totalCustomers },
  ];

  // Search matches a company OR any of its outlets, so looking up an outlet
  // by name still finds it even though outlets are nested a level down now.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (!q) return true;
      if (c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)) return true;
      return c.outlets.some((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
    });
  }, [companies, query, status]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Companies</h1>
          <div className="text-[var(--muted)]">
            {isLoading ? (
              <Skeleton className="inline-block h-4 w-40 align-middle" />
            ) : (
              `${companies.length} registered · ${totalOutlets} outlet${totalOutlets === 1 ? "" : "s"}`
            )}
          </div>
        </div>
        {isOwner && (
          <Link
            to="register"
            className="stamp-interactive rounded-full px-5 py-3 text-[15px] font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            + Register a company
          </Link>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
            <div className="mb-1.5 text-[13px] text-[var(--muted)]">{s.label}</div>
            {isLoading ? <Skeleton className="h-[26px] w-10" /> : <div className="font-display text-[26px] font-bold">{s.val}</div>}
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--soft)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies or outlets…"
            className="w-full rounded-full border border-[var(--line)] bg-[var(--surface)] py-2.5 pl-10 pr-4 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1">
          {(["all", "active", "suspended"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-bold capitalize transition-colors"
              style={status === s ? { background: "var(--primary)", color: "white" } : { color: "var(--muted)" }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-[var(--radius-card)]" />)
        ) : filtered.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-[var(--surface)] px-5 py-10 text-center text-sm text-[var(--muted)] shadow-ambient">
            {companies.length === 0 ? "No companies yet. Register your first." : "No companies match your search."}
          </div>
        ) : (
          filtered.map((c) => {
            const open = expanded.has(c.id);
            return (
              <div key={c.id} className="shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
                <div className="flex items-center gap-3 px-5 py-4">
                  <button
                    onClick={() => toggle(c.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                    aria-expanded={open}
                  >
                    <ChevronRight
                      className="h-4 w-4 flex-shrink-0 text-[var(--soft)] transition-transform"
                      style={{ transform: open ? "rotate(90deg)" : undefined }}
                    />
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-xs font-bold text-white"
                      style={{ background: c.branding?.primaryColor || "var(--brand)" }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{c.name}</span>
                      <span className="block truncate font-mono text-xs text-[var(--soft)]">/{c.slug}</span>
                    </span>
                  </button>

                  <span
                    className="rounded-full px-2.5 py-1 text-[12px] font-bold"
                    style={{
                      background: c.status === "active" ? "var(--ok-soft)" : "var(--warn-soft)",
                      color: c.status === "active" ? "var(--ok)" : "var(--warn)",
                    }}
                  >
                    {c.status}
                  </span>
                  <span className="w-20 text-right text-sm font-semibold">
                    {c.outletCount} outlet{c.outletCount === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={() => navigate(`/platform/company/${c.id}`)}
                    className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]"
                  >
                    Manage
                  </button>
                </div>

                {open && (
                  <div className="border-t border-[var(--line)] bg-[var(--bg)] px-5 py-3">
                    {c.outlets.length === 0 ? (
                      <p className="py-2 text-xs text-[var(--muted)]">
                        No outlets yet — this company registers its own.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--soft)]">
                          <span>Outlet</span>
                          <span>Status</span>
                          <span>Customers</span>
                          <span>Points</span>
                        </div>
                        {c.outlets.map((o) => (
                          <div key={o.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-1 py-1.5 text-[13px]">
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{o.name}</span>
                              <span className="block truncate font-mono text-[11px] text-[var(--soft)]">
                                /{c.slug}/{o.slug}
                              </span>
                            </span>
                            <span className="text-[var(--muted)]">{o.status}</span>
                            <span className="font-semibold">{o.customersCount}</span>
                            <span className="font-semibold">{o.pointsIssued}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
