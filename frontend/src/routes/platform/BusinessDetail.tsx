import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import type { Business } from "./Businesses";
import { CATEGORY_LABELS, BUSINESS_CATEGORIES, type BusinessCategory } from "../../hooks/useAdminSettings";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

export default function BusinessDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; category: BusinessCategory; adminEmail: string } | null>(null);

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

  useEffect(() => {
    if (business && !form) {
      setForm({ name: business.name, category: business.category, adminEmail: "" });
    }
  }, [business, form]);

  const setStatus = useMutation({
    mutationFn: (status: "active" | "suspended") =>
      apiRequest(`/api/platform/businesses/${id}`, { method: "PATCH", role: "platform", body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformBusiness", id] });
      qc.invalidateQueries({ queryKey: ["platformBusinesses"] });
      toast.success("Status updated!");
    },
    onError: (e) => toast.error((e as Error).message || "Couldn't update that — try again."),
  });

  const update = useMutation({
    mutationFn: (patch: { name?: string; category?: BusinessCategory; adminEmail?: string }) =>
      apiRequest<{ success: boolean; admin?: { email: string } }>(`/api/platform/businesses/${id}`, {
        method: "PATCH",
        role: "platform",
        body: patch,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["platformBusiness", id] });
      qc.invalidateQueries({ queryKey: ["platformBusinesses"] });
      toast.success(res.admin ? "Saved — a fresh verification email was sent." : "Saved!");
      setForm((f) => (f ? { ...f, adminEmail: "" } : f));
    },
    onError: (e) => toast.error((e as Error).message || "Couldn't save that — try again."),
  });

  const saveDetails = () => {
    if (!form) return;
    const patch: { name?: string; category?: BusinessCategory; adminEmail?: string } = {};
    if (business && form.name !== business.name) patch.name = form.name;
    if (business && form.category !== business.category) patch.category = form.category;
    if (form.adminEmail.trim()) patch.adminEmail = form.adminEmail.trim();
    if (Object.keys(patch).length === 0) return;
    update.mutate(patch);
  };

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
            <div key={i} className="shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
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
            onClick={() => setConfirmOpen(true)}
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
          <div key={s.label} className="shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
            <div className="mb-1.5 text-[13px] text-[var(--muted)]">{s.label}</div>
            <div className="font-display text-[24px] font-extrabold">{s.val}</div>
          </div>
        ))}
      </div>

      {form && (
        <div className="mt-5 shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
          <h3 className="mb-4 font-display text-lg font-bold text-[var(--ink)]">Edit details</h3>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-bold">Business name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => (f ? { ...f, category: e.target.value as BusinessCategory } : f))}
                className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
              >
                {BUSINESS_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div className="border-t border-[var(--line)] pt-4">
              <label className="mb-1.5 block text-sm font-bold">Fix admin email</label>
              <p className="mb-2 text-[13px] text-[var(--muted)]">
                Only fill this in if the admin's email was entered wrong — this resets their
                verification and resends a fresh link to the new address.
              </p>
              <input
                value={form.adminEmail}
                onChange={(e) => setForm((f) => (f ? { ...f, adminEmail: e.target.value } : f))}
                placeholder="leave blank to keep the current email"
                className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
              />
            </div>
            <button
              onClick={saveDetails}
              disabled={update.isPending}
              className="stamp-interactive rounded-[13px] py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--plat)" }}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {suspended && (
        <div className="mt-5 rounded-[16px] border border-[var(--warn-soft)] bg-[var(--warn-soft)] px-5 py-4 text-sm" style={{ color: "var(--warn)" }}>
          This business is suspended. Its storefront and logins are disabled until reactivated.
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={suspended ? "Reactivate this business?" : "Suspend this business?"}
        description={
          suspended
            ? "Customers and the admin login will work again immediately."
            : "Customers and the admin login will be disabled until reactivated."
        }
        confirmLabel={suspended ? "Reactivate" : "Suspend"}
        confirmColor={suspended ? "var(--ok)" : "var(--warn)"}
        onConfirm={() => setStatus.mutate(suspended ? "active" : "suspended")}
      />
    </div>
  );
}
