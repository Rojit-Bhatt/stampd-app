import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../../lib/api";

export interface Business {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  branding: { primaryColor: string };
  customersCount: number;
  stampsIssued: number;
  vouchersRedeemed: number;
}

export function useBusinesses() {
  return useQuery<Business[]>({
    queryKey: ["platformBusinesses"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; businesses: Business[] }>(
        "/api/platform/businesses",
        { role: "platform" },
      );
      return res.businesses || [];
    },
  });
}

export default function Businesses() {
  const navigate = useNavigate();
  const { data: businesses = [], isLoading } = useBusinesses();

  const active = businesses.filter((b) => b.status === "active").length;
  const totalCustomers = businesses.reduce((n, b) => n + b.customersCount, 0);
  const totalStamps = businesses.reduce((n, b) => n + b.stampsIssued, 0);

  const stats = [
    { label: "Businesses", val: businesses.length },
    { label: "Active", val: active },
    { label: "Total customers", val: totalCustomers },
    { label: "Stamps issued", val: totalStamps },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-extrabold text-[var(--ink)]">Businesses</h1>
          <p className="text-[var(--muted)]">
            {isLoading ? "Loading…" : `${businesses.length} onboarded · ${active} active`}
          </p>
        </div>
        <Link
          to="onboard"
          className="rounded-[13px] px-5 py-3 text-[15px] font-bold text-white"
          style={{ background: "var(--plat)" }}
        >
          + Onboard new business
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-1.5 text-[13px] text-[var(--muted)]">{s.label}</div>
            <div className="font-display text-[26px] font-extrabold">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Business</span>
          <span>Status</span>
          <span>Customers</span>
          <span>Stamps</span>
          <span>Redeemed</span>
        </div>

        {businesses.length === 0 && !isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">
            No businesses yet. Onboard your first.
          </div>
        ) : (
          businesses.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/platform/business/${b.id}`)}
              className="grid w-full grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center border-b border-[var(--line)] px-5 py-3.5 text-left last:border-b-0 hover:bg-[var(--bg)]"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-xs font-extrabold text-white"
                  style={{ background: b.branding?.primaryColor || "#8B2635" }}
                >
                  {b.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{b.name}</span>
                  <span className="block truncate font-mono text-xs text-[var(--soft)]">/{b.slug}</span>
                </span>
              </span>
              <span>
                <span
                  className="rounded-full px-2.5 py-1 text-[12px] font-bold"
                  style={{
                    background: b.status === "active" ? "var(--ok-soft)" : "var(--warn-soft)",
                    color: b.status === "active" ? "var(--ok)" : "var(--warn)",
                  }}
                >
                  {b.status}
                </span>
              </span>
              <span className="text-sm font-semibold">{b.customersCount}</span>
              <span className="text-sm font-semibold">{b.stampsIssued}</span>
              <span className="text-sm font-semibold">{b.vouchersRedeemed}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
