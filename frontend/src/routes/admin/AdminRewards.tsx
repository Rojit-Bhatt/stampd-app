import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "@/lib/toast";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useTenant } from "../../context/TenantContext";
import { tenantPath } from "../../lib/tenantPath";
import { formatPoints } from "../../hooks/usePoints";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { RewardFormModal, type AdminRewardItem } from "../../components/admin/RewardFormModal";

function useRewards() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<AdminRewardItem[]>({
    queryKey: ["adminRewards", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: AdminRewardItem[] }>("/api/admin/rewards", {
        role: "admin",
      });
      return res.data || [];
    },
  });
}

// Two sources feed one customer-facing catalog: standalone rewards (here)
// and menu items given a points price (on the Menu page itself, right next
// to the item it applies to — see MenuManagement.tsx).
export default function AdminRewards() {
  const qc = useQueryClient();
  const { companySlug, outletSlug } = useTenant();
  const { data: rewards = [], isLoading } = useRewards();

  const [modal, setModal] = useState<{ open: boolean; initial: AdminRewardItem | null }>({
    open: false,
    initial: null,
  });
  const [confirmDelete, setConfirmDelete] = useState<AdminRewardItem | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminRewards"] });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { isActive: boolean } }) =>
      apiRequest(`/api/admin/rewards/${id}`, { method: "PATCH", role: "admin", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["adminRewards"] });
      const previous = qc.getQueriesData<AdminRewardItem[]>({ queryKey: ["adminRewards"] });
      qc.setQueriesData<AdminRewardItem[]>({ queryKey: ["adminRewards"] }, (old) =>
        old?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error((error as Error).message || "Couldn't update that — try again.");
    },
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/rewards/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: invalidate,
  });

  return (
    <div className="max-w-[760px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-[-0.015em] text-[var(--ink)]">Rewards</h1>
          <p className="text-[var(--muted)]">What customers can put their points toward.</p>
        </div>
        <button
          onClick={() => setModal({ open: true, initial: null })}
          className="stamp-interactive flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white"
          style={{ background: "var(--primary)" }}
        >
          <Plus className="h-4 w-4" />
          New reward
        </button>
      </div>

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
          {rewards.map((r) => (
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
                  <div className="text-[13px] leading-relaxed text-[var(--muted)]">{r.description}</div>
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
                onClick={() => setModal({ open: true, initial: r })}
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
          ))}
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

      <RewardFormModal
        open={modal.open}
        onOpenChange={(open) => setModal((s) => ({ ...s, open }))}
        initial={modal.initial}
        onSaved={() => setModal({ open: false, initial: null })}
      />

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
