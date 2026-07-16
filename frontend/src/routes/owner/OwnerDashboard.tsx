import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";

interface OwnerBusiness {
  organizationId: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  category: string;
  branding: { primaryColor: string };
  customersCount: number;
}

const EMPTY_FORM = { name: "", slug: "", category: "cafe" };

export default function OwnerDashboard() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [limitInfo, setLimitInfo] = useState<{ code: string; message: string } | null>(null);

  const { data: businesses = [], isLoading } = useQuery<OwnerBusiness[]>({
    queryKey: ["ownerBusinesses"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; businesses: OwnerBusiness[] }>(
        "/api/owner/my-businesses",
        { role: "owner-global" },
      );
      return res.businesses || [];
    },
  });

  const create = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) =>
      apiRequest("/api/owner/businesses", { method: "POST", role: "owner-global", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ownerBusinesses"] });
      toast.success("Business created!");
      setForm(EMPTY_FORM);
      setShowForm(false);
      setLimitInfo(null);
    },
    onError: (e: any) => {
      if (e.code === "BUSINESS_LIMIT_REACHED" || e.code === "SUBSCRIPTION_EXPIRED") {
        setLimitInfo({ code: e.code, message: e.message });
      } else {
        toast.error(e.message || "Couldn't create that business — try again.");
      }
    },
  });

  const enterBusiness = async (organizationId: string, slug: string) => {
    try {
      const res = await apiRequest<{ success: boolean; token: string; user: any }>(
        "/api/owner/enter-business",
        { method: "POST", role: "owner-global", body: { organizationId } },
      );
      localStorage.setItem("admin_auth_token", res.token);
      localStorage.setItem("admin_auth_user", JSON.stringify(res.user));
      window.location.href = `/${slug}/admin`;
    } catch (e: any) {
      toast.error(e.message || "Couldn't open that business.");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-extrabold text-[var(--ink)]">Your businesses</h1>
          <p className="text-[var(--muted)]">Switch between every business you run, all from one login.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="stamp-interactive rounded-full px-5 py-3 text-[15px] font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          + Add a business
        </button>
      </div>

      {limitInfo && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[var(--warn-soft)] bg-[var(--warn-soft)] px-5 py-4 text-sm" style={{ color: "var(--warn)" }}>
          <span>{limitInfo.message}</span>
          <Link to="subscription" className="rounded-full bg-white px-4 py-2 text-xs font-bold" style={{ color: "var(--warn)" }}>
            View subscription
          </Link>
        </div>
      )}

      {showForm && (
        <div className="mb-6 max-w-md rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
          <h3 className="mb-4 font-display text-lg font-bold text-[var(--ink)]">New business</h3>
          <div className="flex flex-col gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Business name"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="url-slug"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <button
              onClick={() => create.mutate(form)}
              disabled={create.isPending || !form.name || !form.slug}
              className="stamp-interactive rounded-[13px] py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {create.isPending ? "Creating…" : "Create business"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)
        ) : businesses.length === 0 ? (
          <div className="col-span-full rounded-3xl bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)] shadow-ambient">
            No businesses yet — add your first above.
          </div>
        ) : (
          businesses.map((b) => (
            <button
              key={b.organizationId}
              onClick={() => enterBusiness(b.organizationId, b.slug)}
              className="stamp-interactive rounded-3xl bg-[var(--surface)] p-5 text-left shadow-ambient"
            >
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold text-white"
                  style={{ background: b.branding?.primaryColor || "var(--brand)" }}
                >
                  {b.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{b.name}</span>
                  <span className="block truncate font-mono text-xs text-[var(--soft)]">/{b.slug}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span
                  className="rounded-full px-2.5 py-1 font-bold"
                  style={{
                    background: b.status === "active" ? "var(--ok-soft)" : "var(--warn-soft)",
                    color: b.status === "active" ? "var(--ok)" : "var(--warn)",
                  }}
                >
                  {b.status}
                </span>
                <span>{b.customersCount} customers</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
