import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";

interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  customerNo: string;
  stampsEarned: number;
  lastStampedAt: string | null;
  validVoucherCount: number;
}

function lastVisit(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminCustomers() {
  const { data: settings } = useAdminSettings();
  const required = settings?.program?.stampsRequired ?? 5;

  const { data: customers = [], isLoading } = useQuery<AdminCustomer[]>({
    queryKey: ["adminCustomers"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: AdminCustomer[] }>(
        "/api/admin/customers",
        { role: "admin" },
      );
      return res.data || [];
    },
  });

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Customers</h1>
      <p className="mb-6 text-[var(--muted)]">
        {isLoading ? "Loading…" : `${customers.length} member${customers.length === 1 ? "" : "s"} of ${settings?.name ?? "your business"}`}
      </p>

      <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Customer</span>
          <span>No.</span>
          <span>Stamps</span>
          <span>Vouchers</span>
          <span>Last visit</span>
        </div>

        {customers.length === 0 && !isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">No customers yet.</div>
        ) : (
          customers.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center border-b border-[var(--line)] px-5 py-3.5 last:border-b-0"
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
                {c.stampsEarned}/{required}
              </span>
              <span className="text-sm font-semibold">{c.validVoucherCount}</span>
              <span className="text-[13px] text-[var(--muted)]">{lastVisit(c.lastStampedAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
