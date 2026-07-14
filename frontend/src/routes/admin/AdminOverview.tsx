import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Stamp } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";

interface AdminCustomer {
  id: string;
  stampsEarned: number;
  validVoucherCount: number;
}
interface Scan {
  id: string;
  timestamp: string;
  customerName?: string;
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminOverview() {
  const { slug } = useParams();
  const { data: settings } = useAdminSettings();

  const { data: customers = [] } = useQuery<AdminCustomer[]>({
    queryKey: ["adminCustomers"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: AdminCustomer[] }>(
        "/api/admin/customers",
        { role: "admin" },
      );
      return res.data || [];
    },
  });

  const { data: scans = [] } = useQuery<Scan[]>({
    queryKey: ["recentScans"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: Scan[] }>("/api/admin/recent-scans", {
        role: "admin",
      });
      return res.data || [];
    },
    refetchInterval: 5000,
  });

  const totalCustomers = customers.length;
  const activeVouchers = customers.reduce((n, c) => n + (c.validVoucherCount || 0), 0);
  const stampsOnCards = customers.reduce((n, c) => n + (c.stampsEarned || 0), 0);

  const stats = [
    { label: "Total customers", val: totalCustomers },
    { label: "Active vouchers", val: activeVouchers },
    { label: "Stamps on cards", val: stampsOnCards },
    { label: "Stamps per reward", val: settings?.program?.stampsRequired ?? "—" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Overview</h1>
          <p className="text-[var(--muted)]">Here’s how {settings?.name ?? "your business"} is doing.</p>
        </div>
        <Link
          to={`/${slug}/admin/generate`}
          className="rounded-[13px] px-5 py-3 text-[15px] font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          Generate stamp code
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-2 text-[13px] text-[var(--muted)]">{s.label}</div>
            <div className="font-display text-[28px] font-extrabold leading-none">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--ok)" }} />
          <h3 className="font-display text-[17px] font-bold">Live activity</h3>
        </div>
        {scans.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            No stamp activity yet. Generated codes appear here as customers scan them.
          </p>
        ) : (
          <div className="flex flex-col">
            {scans.slice(0, 12).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-b border-[var(--line)] py-3 last:border-b-0"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                  style={{ background: "var(--plat-soft)", color: "var(--plat)" }}
                >
                  <Stamp className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm">
                  <b>{s.customerName || "A customer"}</b> earned a stamp
                </span>
                <span className="text-xs text-[var(--soft)]">{timeAgo(s.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
