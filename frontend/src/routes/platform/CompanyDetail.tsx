import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import type { Company } from "./Companies";
import { CATEGORY_LABELS } from "../../hooks/useAdminSettings";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { usePlatformAuth } from "../../context/PlatformAuthContext";

export default function CompanyDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { user } = usePlatformAuth();
  const isOwner = user?.platformRole === "owner";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; ownerEmail: string } | null>(null);

  const { data: company, isLoading } = useQuery<Company>({
    queryKey: ["platformCompany", id],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; company: Company }>(
        `/api/platform/companies/${id}`,
        { role: "platform" },
      );
      return res.company;
    },
  });

  useEffect(() => {
    if (company && !form) setForm({ name: company.name, ownerEmail: "" });
  }, [company, form]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["platformCompany", id] });
    qc.invalidateQueries({ queryKey: ["platformCompanies"] });
  };

  const setStatus = useMutation({
    mutationFn: (status: "active" | "suspended") =>
      apiRequest(`/api/platform/companies/${id}`, { method: "PATCH", role: "platform", body: { status } }),
    onSuccess: () => { invalidate(); toast.success("Status updated!"); },
    onError: (e) => toast.error((e as Error).message || "Couldn't update that — try again."),
  });

  const update = useMutation({
    mutationFn: (patch: { name?: string; ownerEmail?: string }) =>
      apiRequest<{ success: boolean; owner?: { email: string } }>(`/api/platform/companies/${id}`, {
        method: "PATCH", role: "platform", body: patch,
      }),
    onSuccess: (res) => {
      invalidate();
      toast.success(res.owner ? "Saved — a fresh verification email was sent." : "Saved!");
      setForm((f) => (f ? { ...f, ownerEmail: "" } : f));
    },
    onError: (e) => toast.error((e as Error).message || "Couldn't save that — try again."),
  });

  const setOutletStatus = useMutation({
    mutationFn: ({ outletId, status }: { outletId: string; status: string }) =>
      apiRequest(`/api/platform/outlets/${outletId}`, { method: "PATCH", role: "platform", body: { status } }),
    onSuccess: () => { invalidate(); toast.success("Outlet updated!"); },
    onError: (e) => toast.error((e as Error).message || "Couldn't update that outlet."),
  });

  const saveDetails = () => {
    if (!form || !company) return;
    const patch: { name?: string; ownerEmail?: string } = {};
    if (form.name !== company.name) patch.name = form.name;
    if (form.ownerEmail.trim()) patch.ownerEmail = form.ownerEmail.trim();
    if (Object.keys(patch).length === 0) return;
    update.mutate(patch);
  };

  if (isLoading || !company) {
    return (
      <div>
        <Skeleton className="mb-4 h-4 w-24" />
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Skeleton className="h-[60px] w-[60px] rounded-[16px]" />
          <div className="flex-1">
            <Skeleton className="mb-1.5 h-7 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <Skeleton className="h-40 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  const brand = company.branding?.primaryColor || "#8B2635";
  const suspended = company.status === "suspended";

  const stats = [
    { label: "Outlets", val: company.outletCount },
    { label: "Customers", val: company.customersCount },
    { label: "Points issued", val: company.pointsIssued },
    { label: "Redemptions", val: company.redemptionCount },
  ];

  return (
    <div>
      <Link to="/platform" className="mb-4 inline-block text-[13px] text-[var(--muted)]">
        ← Companies
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div
          className="flex items-center justify-center rounded-[16px] font-display text-[22px] font-bold text-white"
          style={{ width: 60, height: 60, background: brand }}
        >
          {company.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">{company.name}</h1>
          <span className="font-mono text-[13px] text-[var(--soft)]">/{company.slug}</span>
          <span
            className="ml-2 rounded-full px-2.5 py-1 text-[12px] font-bold"
            style={{
              background: suspended ? "var(--warn-soft)" : "var(--ok-soft)",
              color: suspended ? "var(--warn)" : "var(--ok)",
            }}
          >
            {company.status}
          </span>
        </div>
        {isOwner && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={setStatus.isPending}
            className="rounded-[var(--radius-btn)] border bg-white px-4 py-2.5 font-bold disabled:opacity-50"
            style={{
              borderColor: suspended ? "var(--ok-soft)" : "var(--warn-soft)",
              color: suspended ? "var(--ok)" : "var(--warn)",
            }}
          >
            {suspended ? "Reactivate" : "Suspend"}
          </button>
        )}
      </div>

      {suspended && (
        <div className="mb-5 rounded-[16px] border border-[var(--warn-soft)] bg-[var(--warn-soft)] px-5 py-4 text-sm" style={{ color: "var(--warn)" }}>
          This company is suspended — every one of its outlets is offline and its owner can't sign in.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
            <div className="mb-1.5 text-[13px] text-[var(--muted)]">{s.label}</div>
            <div className="font-display text-[24px] font-bold">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-5 py-3.5">
          <h3 className="font-display text-lg font-bold text-[var(--ink)]">Outlets</h3>
          <p className="text-[13px] text-[var(--muted)]">This company registers its own — you can still step in.</p>
        </div>
        {company.outlets.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">No outlets yet.</div>
        ) : (
          company.outlets.map((o) => (
            <div key={o.id} className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 text-sm last:border-b-0">
              <span className="min-w-0">
                <span className="block truncate font-bold">{o.name}</span>
                <span className="block truncate font-mono text-xs text-[var(--soft)]">/{company.slug}/{o.slug}</span>
              </span>
              <span className="text-[var(--muted)]">{CATEGORY_LABELS[o.category] ?? o.category}</span>
              <span className="text-[var(--muted)]">{o.status}</span>
              <span className="flex gap-2">
                <a
                  href={`/${company.slug}/${o.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]"
                >
                  View
                </a>
                {isOwner && o.status !== "archived" && (
                  <button
                    onClick={() => setOutletStatus.mutate({ outletId: o.id, status: o.status === "suspended" ? "active" : "suspended" })}
                    className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]"
                  >
                    {o.status === "suspended" ? "Reactivate" : "Suspend"}
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      {form && isOwner && (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
          <h3 className="mb-4 font-display text-lg font-bold text-[var(--ink)]">Edit company</h3>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-bold">Company name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
            <div className="border-t border-[var(--line)] pt-4">
              <label className="mb-1.5 block text-sm font-bold">Fix owner email</label>
              <p className="mb-2 text-[13px] text-[var(--muted)]">
                Only fill this in if the owner's email was entered wrong — it resets their
                verification and sends a fresh link to the new address.
                {company.owner ? ` Currently ${company.owner.email}.` : ""}
              </p>
              <input
                value={form.ownerEmail}
                onChange={(e) => setForm((f) => (f ? { ...f, ownerEmail: e.target.value } : f))}
                placeholder="leave blank to keep the current email"
                className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
            <button
              onClick={saveDetails}
              disabled={update.isPending}
              className="stamp-interactive rounded-[var(--radius-btn)] py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {!isOwner && (
        <div className="mt-5 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-sm text-[var(--muted)]">
          Your support role can view this company but can't edit it or change its status.
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={suspended ? "Reactivate this company?" : "Suspend this company?"}
        description={
          suspended
            ? "Its outlets come back online and its owner can sign in again."
            : "Every one of its outlets goes offline and its owner is locked out until reactivated."
        }
        confirmLabel={suspended ? "Reactivate" : "Suspend"}
        confirmColor={suspended ? "var(--ok)" : "var(--warn)"}
        onConfirm={() => setStatus.mutate(suspended ? "active" : "suspended")}
      />
    </div>
  );
}
