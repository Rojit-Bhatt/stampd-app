import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Check, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useTenant } from "../../context/TenantContext";
import { tenantPath } from "../../lib/tenantPath";
import { formatPoints } from "../../hooks/usePoints";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

interface RewardItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  pointsPrice: number;
  isActive: boolean;
  sortOrder: number;
}

interface RewardDraft {
  name: string;
  description: string;
  imageUrl: string;
  pointsPrice: number;
}

const emptyDraft = (): RewardDraft => ({ name: "", description: "", imageUrl: "", pointsPrice: 100 });

function useRewards() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<RewardItem[]>({
    queryKey: ["adminRewards", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: RewardItem[] }>("/api/admin/rewards", {
        role: "admin",
      });
      return res.data || [];
    },
  });
}

function RewardFields({ draft, onChange }: { draft: RewardDraft; onChange: (n: RewardDraft) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[2fr_1fr]">
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Name (e.g. Tote Bag)"
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <label className="flex items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5">
          <input
            type="number"
            min={0}
            value={draft.pointsPrice}
            onChange={(e) => onChange({ ...draft, pointsPrice: Number(e.target.value) })}
            className="w-20 bg-transparent text-sm focus:outline-none"
          />
          <span className="text-sm text-[var(--muted)]">points</span>
        </label>
      </div>
      <input
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        placeholder="Description (shown to customers)"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <input
        value={draft.imageUrl}
        onChange={(e) => onChange({ ...draft, imageUrl: e.target.value })}
        placeholder="Image URL (optional)"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
    </div>
  );
}

// Two sources feed one customer-facing catalog: standalone rewards (here)
// and menu items given a points price (on the Menu page itself, right next
// to the item it applies to — see MenuManagement.tsx).
export default function AdminRewards() {
  const qc = useQueryClient();
  const { companySlug, outletSlug } = useTenant();
  const { data: rewards = [], isLoading } = useRewards();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<RewardDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RewardDraft>(emptyDraft());
  const [confirmDelete, setConfirmDelete] = useState<RewardItem | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminRewards"] });

  const create = useMutation({
    mutationFn: (d: RewardDraft) =>
      apiRequest("/api/admin/rewards", { method: "POST", role: "admin", body: d }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RewardDraft> & { isActive?: boolean } }) =>
      apiRequest(`/api/admin/rewards/${id}`, { method: "PATCH", role: "admin", body: patch }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/rewards/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: invalidate,
  });

  return (
    <div className="max-w-[760px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Rewards</h1>
          <p className="text-[var(--muted)]">What customers can put their points toward.</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="stamp-interactive flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            <Plus className="h-4 w-4" />
            New reward
          </button>
        )}
      </div>

      {adding && (
        <div className="shadow-ambient mb-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-5">
          <RewardFields draft={draft} onChange={setDraft} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                try {
                  await create.mutateAsync(draft);
                  toast.success("Reward added!");
                  setDraft(emptyDraft());
                  setAdding(false);
                } catch (err) {
                  toast.error((err as Error).message || "Couldn't save that — try again.");
                }
              }}
              disabled={create.isPending}
              className="stamp-interactive rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {create.isPending ? "Saving…" : "Save reward"}
            </button>
            <button
              onClick={() => { setAdding(false); setDraft(emptyDraft()); }}
              className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-bold text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
        Points-only rewards
      </h2>
      {isLoading ? (
        <Skeleton className="mb-6 h-20 rounded-[var(--radius-card)]" />
      ) : rewards.length === 0 ? (
        <div className="shadow-ambient mb-6 rounded-[var(--radius-card)] bg-[var(--surface)] px-5 py-8 text-center text-sm text-[var(--muted)]">
          Nothing here yet — a tote bag, a free upgrade, anything you don't sell but would hand over for points.
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3">
          {rewards.map((r) =>
            editingId === r.id ? (
              <div key={r.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
                <RewardFields draft={editDraft} onChange={setEditDraft} />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await update.mutateAsync({ id: r.id, patch: editDraft });
                        toast.success("Reward updated!");
                        setEditingId(null);
                      } catch (err) {
                        toast.error((err as Error).message || "Couldn't save that — try again.");
                      }
                    }}
                    className="stamp-interactive flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-white"
                    style={{ background: "var(--primary)" }}
                  >
                    <Check className="h-4 w-4" />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-bold text-[var(--muted)]"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={r.id}
                className="flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient px-5 py-4"
                style={{ opacity: r.isActive ? 1 : 0.55 }}
              >
                {r.imageUrl ? (
                  <img
                    src={r.imageUrl}
                    alt={r.name}
                    className="h-10 w-10 flex-shrink-0 rounded-[var(--radius-btn)] object-cover"
                  />
                ) : (
                  <span
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)]"
                    style={{ background: "var(--surface-2)", color: "var(--primary-deep)" }}
                  >
                    <Gift className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-[var(--ink)]">{r.name}</div>
                  {r.description && (
                    <div className="truncate text-[13px] text-[var(--muted)]">{r.description}</div>
                  )}
                </div>
                <span className="flex-shrink-0 font-display text-lg font-bold" style={{ color: "var(--primary-deep)" }}>
                  {formatPoints(r.pointsPrice)}
                </span>
                <button
                  onClick={async () => {
                    await update.mutateAsync({ id: r.id, patch: { isActive: !r.isActive } });
                    toast.success(r.isActive ? "Reward hidden." : "Reward is back!");
                  }}
                  className="flex-shrink-0 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]"
                >
                  {r.isActive ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => {
                    setEditingId(r.id);
                    setEditDraft({
                      name: r.name, description: r.description, imageUrl: r.imageUrl, pointsPrice: r.pointsPrice,
                    });
                  }}
                  aria-label={`Edit ${r.name}`}
                  className="flex-shrink-0 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(r)}
                  aria-label={`Delete ${r.name}`}
                  className="flex-shrink-0 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          )}
        </div>
      )}

      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
        Menu items redeemable for points
      </h2>
      <Link
        to={tenantPath(companySlug, outletSlug, "admin/menu")}
        className="shadow-ambient stamp-interactive flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-[var(--surface)] px-5 py-4 text-sm"
      >
        <span className="text-[var(--muted)]">
          Give a menu item a points price right on the Menu page — it shows up here automatically.
        </span>
        <span className="flex-shrink-0 font-bold" style={{ color: "var(--primary-deep)" }}>
          Go to Menu →
        </span>
      </Link>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        description="Past redemptions still show what was handed over — the ledger keeps its own record. Hide it instead if you might bring it back."
        confirmLabel="Delete"
        confirmColor="var(--err)"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete.id);
            toast.success("Reward deleted.");
          } catch (err) {
            toast.error((err as Error).message || "Couldn't delete that — try again.");
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}
