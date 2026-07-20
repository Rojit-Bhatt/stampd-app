import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Phone, MapPin, Coins } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { Skeleton } from "../../components/ui/skeleton";
import { tenantPath } from "../../lib/tenantPath";
import { formatNpr } from "../../lib/subscription";
import { avatarUrl } from "../../lib/avatar";

interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  customerNo: string;
  phone: string;
  address: string;
  customerAccountId?: string | null;
  avatarVersion?: number;
  pointsBalance: number;
  lifetimePoints: number;
  lastActivityAt: string | null;
  redemptionCount: number;
  totalSpent: number;
  history: { id: string; type: "earn" | "redeem" | "expire"; points: number; billAmount: number | null; rewardName: string; createdAt: string }[];
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
  const { companySlug = "", outletSlug = "", id } = useParams();
  const slug = outletSlug;
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;

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

  const customer = customers.find((c) => c.id === id);

  return (
    <div>
      <div className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)]">
        <Link to={tenantPath(companySlug, slug, "admin/customers")} className="hover:text-[var(--ink)]">
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
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-10 text-center">
          <p className="font-bold text-[var(--ink)]">Customer not found.</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            They may have been removed, or this link is for a different business.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            {avatarUrl(customer.customerAccountId, customer.avatarVersion) ? (
              <img
                src={avatarUrl(customer.customerAccountId, customer.avatarVersion) || ""}
                alt={customer.name}
                className="h-16 w-16 flex-shrink-0 rounded-full object-cover border border-[var(--line)]"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                  const fallback = (e.target as HTMLElement).nextElementSibling;
                  if (fallback) (fallback as HTMLElement).style.display = "flex";
                }}
              />
            ) : null}
            <span
              className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
              style={{
                background: "var(--primary)",
                display: avatarUrl(customer.customerAccountId, customer.avatarVersion) ? "none" : "flex"
              }}
            >
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
            <BalanceStat balance={customer.pointsBalance} />
            <Stat label="Lifetime points" value={String(customer.lifetimePoints)} />
            <Stat label="Redemptions" value={String(customer.redemptionCount)} />
            <Stat label="Total spent" value={formatNpr(customer.totalSpent)} />
          </div>

          <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
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

          <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
            <div className="mb-4 flex items-center gap-2">
              <Coins className="h-4 w-4" style={{ color: "var(--primary-deep)" }} />
              <h3 className="font-display text-lg font-bold text-[var(--ink)]">Recent activity</h3>
            </div>
            {customer.history.length === 0 ? (
              <p className="py-4 text-sm text-[var(--muted)]">Nothing yet.</p>
            ) : (
              <div className="flex flex-col">
                {customer.history.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 border-b border-[var(--line)] py-3 text-sm text-[var(--ink)] last:border-b-0"
                  >
                    <span className="flex-1">
                      {row.type === "earn"
                        ? `Earned on a ${formatNpr(row.billAmount ?? 0)} bill`
                        : row.type === "redeem"
                          ? `Redeemed ${row.rewardName || "a reward"}`
                          : "Points expired"}
                    </span>
                    <span
                      className="font-bold"
                      style={{ color: row.points > 0 ? "var(--ok)" : "var(--muted)" }}
                    >
                      {row.points > 0 ? "+" : ""}{row.points}
                    </span>
                    <span className="w-28 text-right text-[13px] text-[var(--muted)]">
                      {formatVisit(row.createdAt)}
                    </span>
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
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
      <div className="mb-1 text-[13px] text-[var(--muted)]">{label}</div>
      <div className="font-display text-2xl font-bold text-[var(--ink)]">{value}</div>
    </div>
  );
}

// The one brand-tinted stat tile among otherwise-plain cards — same "one
// accent, quiet surroundings" restraint the customer's own balance card uses.
// No progress bar: a balance has no target to fill toward.
function BalanceStat({ balance }: { balance: number }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] p-5 text-white" style={{ background: "var(--primary)" }}>
      <Coins className="absolute -bottom-3 -right-3 h-16 w-16 opacity-15" aria-hidden="true" />
      <div className="relative mb-1 text-[13px] opacity-80">Points balance</div>
      <div className="relative font-display text-2xl font-bold">{balance}</div>
    </div>
  );
}
