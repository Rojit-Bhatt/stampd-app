import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Phone, MapPin, Ticket } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { Skeleton } from "../../components/ui/skeleton";

interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  customerNo: string;
  phone: string;
  address: string;
  stampsEarned: number;
  lastStampedAt: string | null;
  validVoucherCount: number;
  lifetimeVoucherCount: number;
  totalSpent: number;
  scanHistory: { id: string; timestamp: string }[];
}

function formatVisit(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A dedicated page for one customer (not a drawer) — matches the reference
// design's full-page drill-down. Reuses the already-cached admin customers
// list rather than adding a new backend endpoint for a single row.
export default function AdminCustomerDetail() {
  const { slug, id } = useParams();
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

  const customer = customers.find((c) => c.id === id);

  return (
    <div>
      <div className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)]">
        <Link to={`/${slug}/admin/customers`} className="hover:text-[var(--ink)]">
          Customers
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[var(--ink)]">Detail</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div>
            <Skeleton className="mb-2 h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      ) : !customer ? (
        <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-10 text-center">
          <p className="font-bold text-[var(--ink)]">Customer not found.</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            They may have been removed, or this link is for a different business.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: "var(--brand)" }}>
              {customer.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-3xl font-bold text-[var(--ink)]">{customer.name}</h1>
              <p className="truncate text-sm text-[var(--muted)]">
                {customer.email} · {customer.customerNo}
              </p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <CurrentCardStat stampsEarned={customer.stampsEarned} stampsRequired={required} />
            <Stat label="Active vouchers" value={String(customer.validVoucherCount)} />
            <Stat label="Lifetime vouchers" value={String(customer.lifetimeVoucherCount)} />
            <Stat label="Total spent" value={String(customer.totalSpent)} />
          </div>

          <div className="mb-6 shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">Contact</div>
            <div className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <Phone className="h-4 w-4 text-[var(--muted)]" />
              {customer.phone || "—"}
            </div>
            <div className="mt-2 flex items-start gap-2 text-sm text-[var(--ink)]">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              {customer.address || "—"}
            </div>
          </div>

          <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Ticket className="h-4 w-4" style={{ color: "var(--brand)" }} />
              <h3 className="font-display text-lg font-bold text-[var(--ink)]">Recent visits</h3>
            </div>
            {customer.scanHistory.length === 0 ? (
              <p className="py-4 text-sm text-[var(--muted)]">No visits yet.</p>
            ) : (
              <div className="flex flex-col">
                {customer.scanHistory.map((visit) => (
                  <div key={visit.id} className="border-b border-[var(--line)] py-3 text-sm text-[var(--ink)] last:border-b-0">
                    {formatVisit(visit.timestamp)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
      <div className="mb-1 text-[13px] text-[var(--muted)]">{label}</div>
      <div className="font-display text-2xl font-bold text-[var(--ink)]">{value}</div>
    </div>
  );
}

// The one brand-tinted stat tile among otherwise-plain cards — same "one
// accent, quiet surroundings" restraint as the reward card itself.
function CurrentCardStat({ stampsEarned, stampsRequired }: { stampsEarned: number; stampsRequired: number }) {
  const pct = Math.min(100, Math.round((stampsEarned / Math.max(1, stampsRequired)) * 100));
  return (
    <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: "var(--brand)" }}>
      <Ticket className="absolute -bottom-3 -right-3 h-16 w-16 opacity-15" aria-hidden="true" />
      <div className="relative mb-1 text-[13px] opacity-80">Current card</div>
      <div className="relative font-display text-2xl font-bold">
        {stampsEarned}/{stampsRequired}
      </div>
      <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
