import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import type { Business } from "./Businesses";
import { Skeleton } from "../../components/ui/skeleton";

export default function BusinessDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();

  const { data: business, isLoading } = useQuery<Business & { menuEnabled: boolean }>({
    queryKey: ["platformBusiness", id],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; business: Business & { menuEnabled: boolean } }>(
        `/api/platform/businesses/${id}`,
        { role: "platform" },
      );
      return res.business;
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: "active" | "suspended") =>
      apiRequest(`/api/platform/businesses/${id}`, { method: "PATCH", role: "platform", body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformBusiness", id] });
      qc.invalidateQueries({ queryKey: ["platformBusinesses"] });
      toast.success("Status updated");
    },
    onError: (e) => toast.error((e as Error).message || "Failed to update."),
  });

  if (isLoading || !business) {
    return (
      <div>
        <Skeleton className="mb-4 h-4 w-24" />
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Skeleton className="h-[60px] w-[60px] rounded-[16px]" />
          <div className="flex-1">
            <Skeleton className="mb-1.5 h-7 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-11 w-24 rounded-[12px]" />
          <Skeleton className="h-11 w-36 rounded-[12px]" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
              <Skeleton className="mb-1.5 h-3.5 w-20" />
              <Skeleton className="h-6 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const brand = business.branding?.primaryColor || "#8B2635";
  const suspended = business.status === "suspended";

  const stats = [
    { label: "Customers", val: business.customersCount },
    { label: "Stamps issued", val: business.stampsIssued },
    { label: "Vouchers redeemed", val: business.vouchersRedeemed },
    { label: "Menu", val: business.menuEnabled ? "On" : "Off" },
  ];

  return (
    <div>
      <Link to="/platform" className="mb-4 inline-block text-[13px] text-[var(--muted)]">
        ← Businesses
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div
          className="flex h-15 w-15 items-center justify-center rounded-[16px] font-display text-[22px] font-extrabold text-white"
          style={{ width: 60, height: 60, background: brand }}
        >
          {business.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">{business.name}</h1>
          <span className="font-mono text-[13px] text-[var(--soft)]">/{business.slug}</span>
          <span
            className="ml-2 rounded-full px-2.5 py-1 text-[12px] font-bold"
            style={{
              background: suspended ? "var(--warn-soft)" : "var(--ok-soft)",
              color: suspended ? "var(--warn)" : "var(--ok)",
            }}
          >
            {business.status}
          </span>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => setStatus.mutate(suspended ? "active" : "suspended")}
            disabled={setStatus.isPending}
            className="rounded-[12px] border bg-white px-4 py-2.5 font-bold disabled:opacity-50"
            style={{
              borderColor: suspended ? "var(--ok-soft)" : "var(--warn-soft)",
              color: suspended ? "var(--ok)" : "var(--warn)",
            }}
          >
            {suspended ? "Reactivate" : "Suspend"}
          </button>
          <a
            href={`/${business.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-[12px] px-4 py-2.5 font-bold text-white"
            style={{ background: "var(--plat)" }}
          >
            View storefront
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-1.5 text-[13px] text-[var(--muted)]">{s.label}</div>
            <div className="font-display text-[24px] font-extrabold">{s.val}</div>
          </div>
        ))}
      </div>

      {suspended && (
        <div className="mt-5 rounded-[16px] border border-[var(--warn-soft)] bg-[var(--warn-soft)] px-5 py-4 text-sm" style={{ color: "var(--warn)" }}>
          This business is suspended. Its storefront and logins are disabled until reactivated.
        </div>
      )}
    </div>
  );
}
