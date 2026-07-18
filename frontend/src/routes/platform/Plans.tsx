import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";
import { formatNpr } from "../../lib/subscription";

interface Plan {
  id: string;
  slug: string;
  name: string;
  priceNpr: number;
  businessLimit: number;
  features: string[];
  isMostPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY_FORM = { name: "", slug: "", priceNpr: "", businessLimit: "", features: "", isMostPopular: false };
type FormState = typeof EMPTY_FORM;

export default function Plans() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(EMPTY_FORM);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["platformPlans"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; plans: Plan[] }>("/api/platform/plans", { role: "platform" });
      return res.plans || [];
    },
  });

  const create = useMutation({
    mutationFn: (body: any) => apiRequest("/api/platform/plans", { method: "POST", role: "platform", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformPlans"] });
      toast.success("Plan created!");
      setCreating(false);
      setCreateForm(EMPTY_FORM);
    },
    onError: (e: any) => toast.error(e.message || "Couldn't create that plan — try again."),
  });

  const update = useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: any }) =>
      apiRequest(`/api/platform/plans/${slug}`, { method: "PATCH", role: "platform", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformPlans"] });
      toast.success("Plan updated!");
      setEditingSlug(null);
    },
    onError: (e: any) => toast.error(e.message || "Couldn't save that — try again."),
  });

  const archive = useMutation({
    mutationFn: (slug: string) => apiRequest(`/api/platform/plans/${slug}`, { method: "DELETE", role: "platform" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformPlans"] });
      toast.success("Plan archived.");
    },
    onError: (e: any) => toast.error(e.message || "Couldn't archive that — try again."),
  });

  const restore = useMutation({
    mutationFn: (slug: string) => apiRequest(`/api/platform/plans/${slug}`, { method: "PATCH", role: "platform", body: { isActive: true } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformPlans"] });
      toast.success("Plan restored.");
    },
    onError: (e: any) => toast.error(e.message || "Couldn't restore that — try again."),
  });

  const startEdit = (p: Plan) => {
    setEditingSlug(p.slug);
    setEditForm({
      name: p.name,
      slug: p.slug,
      priceNpr: String(p.priceNpr),
      businessLimit: String(p.businessLimit),
      features: p.features.join("\n"),
      isMostPopular: p.isMostPopular,
    });
  };

  const parseFeatures = (raw: string) => raw.split("\n").map((f) => f.trim()).filter(Boolean);

  const activePlans = plans.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const archivedPlans = plans.filter((p) => !p.isActive);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--soft)]">Revenue settings</div>
          <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Subscription plans</h1>
          <p className="text-[var(--muted)]">Configure tiers and business limits. Changes affect new activations immediately.</p>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          className="stamp-interactive rounded-full px-5 py-3 text-[15px] font-bold text-white"
          style={{ background: "var(--primary)" }}
        >
          + Create new plan
        </button>
      </div>

      {creating && (
        <PlanForm
          form={createForm}
          setForm={setCreateForm}
          onCancel={() => setCreating(false)}
          onSubmit={() =>
            create.mutate({
              name: createForm.name,
              slug: createForm.slug,
              priceNpr: Number(createForm.priceNpr),
              businessLimit: Number(createForm.businessLimit),
              features: parseFeatures(createForm.features),
              isMostPopular: createForm.isMostPopular,
            })
          }
          busy={create.isPending}
          submitLabel="Create plan"
          showSlug
        />
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-96 rounded-[var(--radius-card)]" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {activePlans.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-[var(--radius-card)] p-6 shadow-ambient"
              style={p.isMostPopular ? { background: "var(--primary)", color: "white" } : { background: "var(--surface)" }}
            >
              <span
                className="mb-3 inline-block w-fit rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                style={p.isMostPopular ? { background: "rgba(255,255,255,0.16)", color: "white" } : { background: "var(--line)", color: "var(--soft)" }}
              >
                {p.isMostPopular ? "Most popular" : p.slug}
              </span>
              <h3 className="font-display text-xl font-bold">{p.name}</h3>
              <div className="mt-1 mb-4">
                <span className="font-display text-[34px] font-bold">{formatNpr(p.priceNpr)}</span>
                <span className={`ml-1 text-sm ${p.isMostPopular ? "text-white/70" : "text-[var(--muted)]"}`}>/yr</span>
              </div>
              <ul className="mb-6 flex flex-1 flex-col gap-2 text-sm">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${p.isMostPopular ? "text-white" : "text-[var(--ok)]"}`} />
                    <span className={p.isMostPopular ? "text-white/90" : "text-[var(--ink)]"}>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => startEdit(p)}
                className="rounded-[var(--radius-btn)] border py-2.5 text-sm font-bold"
                style={
                  p.isMostPopular
                    ? { background: "white", color: "var(--primary-deep)", borderColor: "transparent" }
                    : { borderColor: "var(--line)", color: "var(--ink)" }
                }
              >
                Edit plan
              </button>
            </div>
          ))}
        </div>
      )}

      {editingSlug && (
        <div className="mt-6">
          <PlanForm
            form={editForm}
            setForm={setEditForm}
            onCancel={() => setEditingSlug(null)}
            onSubmit={() =>
              update.mutate({
                slug: editingSlug,
                body: {
                  name: editForm.name,
                  priceNpr: Number(editForm.priceNpr),
                  businessLimit: Number(editForm.businessLimit),
                  features: parseFeatures(editForm.features),
                  isMostPopular: editForm.isMostPopular,
                },
              })
            }
            busy={update.isPending}
            submitLabel="Save changes"
          />
        </div>
      )}

      <div className="mt-8 shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Plan name</span>
          <span>Status</span>
          <span>Price</span>
          <span>Business limit</span>
          <span>Actions</span>
        </div>
        {[...activePlans, ...archivedPlans].map((p) => (
          <div key={p.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-[var(--line)] px-5 py-3.5 text-sm last:border-b-0">
            <span className={`font-bold ${!p.isActive ? "italic text-[var(--soft)]" : ""}`}>{p.name}</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.isActive ? "var(--ok)" : "var(--soft)" }} />
              {p.isActive ? "Active" : "Archived"}
            </span>
            <span>{formatNpr(p.priceNpr)}</span>
            <span>{p.businessLimit}</span>
            <span className="flex gap-3">
              {p.isActive ? (
                <>
                  <button onClick={() => startEdit(p)} className="text-xs font-bold text-[var(--primary-deep)] hover:underline">Edit</button>
                  <button onClick={() => archive.mutate(p.slug)} className="text-xs font-bold text-[var(--muted)] hover:underline">Archive</button>
                </>
              ) : (
                <button onClick={() => restore.mutate(p.slug)} className="text-xs font-bold text-[var(--primary-deep)] hover:underline">Restore</button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanForm({
  form, setForm, onCancel, onSubmit, busy, submitLabel, showSlug,
}: {
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
  submitLabel: string;
  showSlug?: boolean;
}) {
  return (
    <div className="mb-6 max-w-xl rounded-[var(--radius-card)] bg-[var(--surface)] p-6 shadow-ambient">
      <div className="flex flex-col gap-3">
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Plan name (e.g. Growth)"
          className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        {showSlug && (
          <input
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            placeholder="slug (e.g. growth)"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <input
            value={form.priceNpr}
            onChange={(e) => setForm((f) => ({ ...f, priceNpr: e.target.value }))}
            placeholder="Price (NPR/yr)"
            type="number"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            value={form.businessLimit}
            onChange={(e) => setForm((f) => ({ ...f, businessLimit: e.target.value }))}
            placeholder="Business limit"
            type="number"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <textarea
          value={form.features}
          onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
          placeholder={"One feature per line"}
          rows={4}
          className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <input
            type="checkbox"
            checked={form.isMostPopular}
            onChange={(e) => setForm((f) => ({ ...f, isMostPopular: e.target.checked }))}
          />
          Mark as "Most popular"
        </label>
        <div className="flex gap-3">
          <button
            onClick={onSubmit}
            disabled={busy || !form.name || (showSlug && !form.slug) || !form.priceNpr || !form.businessLimit}
            className="stamp-interactive rounded-[var(--radius-btn)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--primary)" }}
          >
            {busy ? "Saving…" : submitLabel}
          </button>
          <button onClick={onCancel} className="rounded-[var(--radius-btn)] border border-[var(--line)] px-5 py-3 text-sm font-bold text-[var(--ink)]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
