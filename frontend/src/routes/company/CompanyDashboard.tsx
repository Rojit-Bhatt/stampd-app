import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { tenantPath } from "../../lib/tenantPath";
import { useCompanyAuth } from "../../context/CompanyAuthContext";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { BUSINESS_CATEGORIES, CATEGORY_LABELS } from "../../hooks/useAdminSettings";

interface Outlet {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
  category: string;
  branding: { primaryColor: string };
  customersCount: number;
  admin: { email: string; name: string; emailVerified: boolean } | null;
}

const EMPTY_FORM = {
  name: "", slug: "", category: "cafe",
  adminName: "", adminEmail: "", adminPassword: "",
  // "" means inherit the company default. Deliberately not 0 or the
  // company's number: an empty box is how this outlet says "whatever my
  // company says", and 0 is a real, different setting (a program that
  // awards nothing).
  earnPercent: "",
};

export default function CompanyDashboard() {
  const qc = useQueryClient();
  const { company } = useCompanyAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [limitInfo, setLimitInfo] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<Outlet | null>(null);

  // The company's own defaults, so the form can show what "inherit" will
  // actually resolve to rather than making the owner guess.
  const { data: companyInfo } = useQuery<{ programDefaults?: { earnPercent: number; pointsExpiryDays: number } }>({
    queryKey: ["companyMe"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; company: any }>("/api/company/me", { role: "company" });
      return res.company || {};
    },
  });
  const defaultEarn = companyInfo?.programDefaults?.earnPercent ?? 100;

  const { data: outlets = [], isLoading } = useQuery<Outlet[]>({
    queryKey: ["companyOutlets"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; outlets: Outlet[] }>(
        "/api/company/outlets",
        { role: "company" },
      );
      return res.outlets || [];
    },
  });

  const create = useMutation({
    mutationFn: ({ earnPercent, ...rest }: typeof EMPTY_FORM) =>
      apiRequest("/api/company/outlets", {
        method: "POST",
        role: "company",
        // Only send an override when one was actually typed — omitting the
        // field entirely is what leaves the outlet inheriting.
        body: earnPercent === "" ? rest : { ...rest, program: { earnPercent: Number(earnPercent) } },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companyOutlets"] });
      toast.success("Outlet created — its admin has a verification email.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      setLimitInfo(null);
    },
    onError: (e: any) => {
      if (e.code === "OUTLET_LIMIT_REACHED" || e.code === "SUBSCRIPTION_EXPIRED" || e.code === "NO_SUBSCRIPTION") {
        setLimitInfo(e.message);
        setShowForm(false);
      } else {
        toast.error(e.message || "Couldn't create that outlet — try again.");
      }
    },
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/company/outlets/${id}`, { method: "DELETE", role: "company" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companyOutlets"] });
      toast.success("Outlet archived — its data is kept, and the plan slot is free.");
    },
    onError: (e: any) => toast.error(e.message || "Couldn't archive that outlet."),
  });

  const restore = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/company/outlets/${id}/restore`, { method: "POST", role: "company" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companyOutlets"] });
      toast.success("Outlet restored.");
    },
    onError: (e: any) => toast.error(e.message || "Couldn't restore that outlet."),
  });

  // Swap the company session for a normal tenant JWT and drop into that
  // outlet's own console.
  const enterOutlet = async (outlet: Outlet) => {
    try {
      const res = await apiRequest<{ token: string; user: any; companySlug: string; outletSlug: string }>(
        "/api/company/enter-outlet",
        { method: "POST", role: "company", body: { organizationId: outlet.id } },
      );
      localStorage.setItem("admin_auth_token", res.token);
      localStorage.setItem("admin_auth_user", JSON.stringify(res.user));
      window.location.href = tenantPath(res.companySlug, res.outletSlug, "admin");
    } catch (e: any) {
      toast.error(e.message || "Couldn't open that outlet.");
    }
  };

  const active = outlets.filter((o) => o.status !== "archived");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Your outlets</h1>
          <p className="text-[var(--muted)]">
            {company ? `${company.name} — ` : ""}
            {active.length} active outlet{active.length === 1 ? "" : "s"}, all from one login.
          </p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setLimitInfo(null); }}
          className="stamp-interactive rounded-full px-5 py-3 text-[15px] font-bold text-white"
          style={{ background: "var(--primary)" }}
        >
          + Add an outlet
        </button>
      </div>

      {limitInfo && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[var(--warn-soft)] bg-[var(--warn-soft)] px-5 py-4 text-sm" style={{ color: "var(--warn)" }}>
          <span>{limitInfo}</span>
          <Link to="/company/subscription" className="rounded-full bg-white px-4 py-2 text-xs font-bold" style={{ color: "var(--warn)" }}>
            View subscription
          </Link>
        </div>
      )}

      {showForm && (
        <div className="mb-6 max-w-lg rounded-[var(--radius-card)] bg-[var(--surface)] p-6 shadow-ambient">
          <h3 className="mb-1 font-display text-lg font-bold text-[var(--ink)]">New outlet</h3>
          <p className="mb-4 text-[13px] text-[var(--muted)]">
            Each outlet gets its own sign-in. Whoever runs it verifies the email once, then uses
            these credentials at the same sign-in page you do.
          </p>
          <div className="flex flex-col gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Outlet name (e.g. Durbarmarg)"
              className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--soft)]">
                URL: /{company?.slug ?? "company"}/<b className="text-[var(--ink)]">{form.slug || "outlet"}</b>
              </span>
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="url-slug"
                className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            >
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>

            <div className="mt-1 border-t border-[var(--line)] pt-3">
              <span className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-[var(--soft)]">
                Earn rate
              </span>
              <div className="flex items-center gap-2">
                <input
                  value={form.earnPercent}
                  onChange={(e) => setForm((f) => ({ ...f, earnPercent: e.target.value }))}
                  placeholder={String(defaultEarn)}
                  type="number"
                  min={0}
                  className="w-28 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
                <span className="text-sm text-[var(--muted)]">% of the bill back as points</span>
              </div>
              <p className="mt-1.5 text-[12px] text-[var(--soft)]">
                {form.earnPercent === ""
                  ? `Leave blank to use your company default (${defaultEarn}%). You can change it per outlet later.`
                  : `This outlet overrides the company default of ${defaultEarn}%.`}
              </p>
            </div>

            <div className="mt-1 border-t border-[var(--line)] pt-3">
              <span className="mb-2 block text-[12px] font-bold uppercase tracking-wider text-[var(--soft)]">
                This outlet's sign-in
              </span>
              <div className="flex flex-col gap-3">
                <input
                  value={form.adminName}
                  onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                  placeholder="Manager's name"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
                <input
                  value={form.adminEmail}
                  onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                  placeholder="Manager's email"
                  type="email"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
                <input
                  value={form.adminPassword}
                  onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                  placeholder="Temporary password"
                  type="password"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => create.mutate(form)}
              disabled={create.isPending || !form.name || !form.slug || !form.adminName || !form.adminEmail || !form.adminPassword}
              className="stamp-interactive rounded-[var(--radius-btn)] py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {create.isPending ? "Creating…" : "Create outlet"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-[var(--radius-card)]" />)
        ) : outlets.length === 0 ? (
          <div className="col-span-full rounded-[var(--radius-card)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--muted)] shadow-ambient">
            No outlets yet — add your first above.
          </div>
        ) : (
          outlets.map((o) => {
            const archived = o.status === "archived";
            return (
              <div key={o.id} className={`rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-ambient ${archived ? "opacity-60" : ""}`}>
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] text-sm font-bold text-white"
                    style={{ background: o.branding?.primaryColor || "var(--brand)" }}
                  >
                    {o.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{o.name}</span>
                    <span className="block truncate font-mono text-xs text-[var(--soft)]">
                      /{company?.slug}/{o.slug}
                    </span>
                  </span>
                </div>

                <div className="mb-3 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span
                    className="rounded-full px-2.5 py-1 font-bold"
                    style={{
                      background: archived ? "var(--line)" : o.status === "active" ? "var(--ok-soft)" : "var(--warn-soft)",
                      color: archived ? "var(--soft)" : o.status === "active" ? "var(--ok)" : "var(--warn)",
                    }}
                  >
                    {o.status}
                  </span>
                  <span>
                    {o.customersCount} customer{o.customersCount === 1 ? "" : "s"}
                  </span>
                </div>

                {o.admin && !o.admin.emailVerified && !archived && (
                  <p className="mb-3 text-[11px] font-semibold" style={{ color: "var(--warn)" }}>
                    {o.admin.email} hasn't verified yet — they can't sign in until they do.
                  </p>
                )}

                <div className="flex gap-2">
                  {archived ? (
                    <button
                      onClick={() => restore.mutate(o.id)}
                      className="flex-1 rounded-[var(--radius-btn)] border border-[var(--line)] py-2 text-xs font-bold hover:bg-[var(--bg)]"
                    >
                      Restore
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => enterOutlet(o)}
                        className="stamp-interactive flex-1 rounded-[var(--radius-btn)] py-2 text-xs font-bold text-white"
                        style={{ background: "var(--primary)" }}
                      >
                        Open console
                      </button>
                      <button
                        onClick={() => setPendingArchive(o)}
                        className="rounded-[var(--radius-btn)] border border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--muted)] hover:bg-[var(--bg)]"
                      >
                        Archive
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={pendingArchive !== null}
        onOpenChange={(open) => !open && setPendingArchive(null)}
        title={`Archive ${pendingArchive?.name ?? "this outlet"}?`}
        description="It stops serving customers and frees a plan slot. Its customers, points and menu are all kept, and you can restore it later."
        confirmLabel="Archive"
        confirmColor="var(--warn)"
        onConfirm={() => {
          if (pendingArchive) archive.mutate(pendingArchive.id);
          setPendingArchive(null);
        }}
      />
    </div>
  );
}
