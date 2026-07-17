import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Check, Gift, UtensilsCrossed } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
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

interface MenuItem {
  _id: string;
  name: string;
  price: number | null;
  pointsPriceCenti: number | null;
  isAvailable: boolean;
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

function useMenuForRewards() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<MenuItem[]>({
    queryKey: ["adminMenu", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; items: MenuItem[] }>("/api/admin/menu", {
        role: "admin",
      });
      return res.items || [];
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
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
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
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
      />
      <input
        value={draft.imageUrl}
        onChange={(e) => onChange({ ...draft, imageUrl: e.target.value })}
        placeholder="Image URL (optional)"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
      />
    </div>
  );
}

// Two sources feed one customer-facing catalog: menu items given a points
// price, and standalone rewards that only exist for points. Both are shown
// here so an admin can see the whole thing in one place — which is the only
// place the split is visible at all.
export default function AdminRewards() {
  const qc = useQueryClient();
  const { data: rewards = [], isLoading } = useRewards();
  const { data: menu = [] } = useMenuForRewards();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<RewardDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RewardDraft>(emptyDraft());
  const [confirmDelete, setConfirmDelete] = useState<RewardItem | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["adminRewards"] });
    qc.invalidateQueries({ queryKey: ["adminMenu"] });
  };

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
  const setMenuPoints = useMutation({
    mutationFn: ({ id, pointsPrice }: { id: string; pointsPrice: number | null }) =>
      apiRequest(`/api/admin/menu/${id}`, { method: "PATCH", role: "admin", body: { pointsPrice } }),
    onSuccess: invalidate,
  });

  const redeemableMenu = menu.filter((m) => m.pointsPriceCenti !== null && m.pointsPriceCenti !== undefined);

  return (
    <div className="max-w-[760px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-extrabold text-[var(--ink)]">Rewards</h1>
          <p className="text-[var(--muted)]">What customers can put their points toward.</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="stamp-interactive flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white"
            style={{ background: "var(--brand)" }}
          >
            <Plus className="h-4 w-4" />
            New reward
          </button>
        )}
      </div>

      {adding && (
        <div className="shadow-ambient mb-4 rounded-3xl bg-[var(--surface)] p-5">
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
              style={{ background: "var(--brand)" }}
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
        <Skeleton className="mb-6 h-20 rounded-3xl" />
      ) : rewards.length === 0 ? (
        <div className="shadow-ambient mb-6 rounded-3xl bg-[var(--surface)] px-5 py-8 text-center text-sm text-[var(--muted)]">
          Nothing here yet — a tote bag, a free upgrade, anything you don't sell but would hand over for points.
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3">
          {rewards.map((r) =>
            editingId === r.id ? (
              <div key={r.id} className="shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
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
                    style={{ background: "var(--brand)" }}
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
                className="shadow-ambient flex items-center gap-3.5 rounded-3xl bg-[var(--surface)] px-5 py-4"
                style={{ opacity: r.isActive ? 1 : 0.55 }}
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: "var(--surface-container)", color: "var(--brand)" }}
                >
                  <Gift className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-[var(--ink)]">{r.name}</div>
                  {r.description && (
                    <div className="truncate text-[13px] text-[var(--muted)]">{r.description}</div>
                  )}
                </div>
                <span className="flex-shrink-0 font-display text-lg font-bold" style={{ color: "var(--brand)" }}>
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
      <div className="shadow-ambient overflow-hidden rounded-3xl bg-[var(--surface)]">
        {menu.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">
            No menu items yet.
          </div>
        ) : (
          menu.map((m) => {
            const points = m.pointsPriceCenti === null || m.pointsPriceCenti === undefined
              ? ""
              : String(m.pointsPriceCenti / 100);
            return (
              <div
                key={m._id}
                className="flex items-center gap-3.5 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0"
              >
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "var(--surface-container)", color: "var(--soft)" }}
                >
                  <UtensilsCrossed className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[var(--ink)]">{m.name}</div>
                  <div className="text-[13px] text-[var(--muted)]">
                    {m.price !== null ? `Rs ${m.price}` : "No price"}
                  </div>
                </div>
                <label className="flex flex-shrink-0 items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    defaultValue={points}
                    placeholder="—"
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const next = raw === "" ? null : Number(raw);
                      const current = m.pointsPriceCenti === null ? null : m.pointsPriceCenti / 100;
                      if (next === current) return;
                      setMenuPoints.mutate({ id: m._id, pointsPrice: next });
                      toast.success(next === null ? `${m.name} is menu-only now.` : `${m.name} costs ${next} points.`);
                    }}
                    className="w-20 bg-transparent text-sm focus:outline-none"
                  />
                  <span className="text-xs text-[var(--muted)]">points</span>
                </label>
              </div>
            );
          })
        )}
      </div>
      <p className="mt-2.5 text-[13px] text-[var(--soft)]">
        Leave a menu item's points blank to keep it on the menu but out of the rewards catalog.
        {redeemableMenu.length > 0
          ? ` ${redeemableMenu.length} item${redeemableMenu.length === 1 ? " is" : "s are"} redeemable.`
          : ""}
      </p>

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
