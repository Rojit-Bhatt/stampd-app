import { useState } from "react";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";
import toast from "@/lib/toast";
import {
  useCampaigns,
  useCampaignMutations,
  formatMultiplier,
  describeSchedule,
  type Campaign,
} from "../../hooks/useCampaigns";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { CampaignFormModal } from "../../components/admin/CampaignFormModal";

// Campaigns change what a bill is worth. Events (a separate page) are
// display-only listings — deliberately kept apart so nobody sets up a poster
// and wonders why points didn't double.
export default function AdminCampaigns() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { update, remove } = useCampaignMutations();

  const [modal, setModal] = useState<{ open: boolean; initial: Campaign | null }>({
    open: false,
    initial: null,
  });
  const [confirmDelete, setConfirmDelete] = useState<Campaign | null>(null);

  const liveCount = campaigns.filter((c) => c.isLive).length;

  const toggle = async (c: Campaign) => {
    try {
      await update.mutateAsync({ id: c.id, patch: { isActive: !c.isActive } });
      toast.success(c.isActive ? "Campaign paused." : "Campaign is back on!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update that — try again.");
    }
  };

  return (
    <div className="max-w-[760px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Campaigns</h1>
          <p className="text-[var(--muted)]">
            Multiply what a bill earns for a while.
            {liveCount > 0 ? ` ${liveCount} running right now.` : ""}
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, initial: null })}
          className="stamp-interactive flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white"
          style={{ background: "var(--primary)" }}
        >
          <Plus className="h-4 w-4" />
          New campaign
        </button>
      </div>

      {/* If two campaigns overlap, only the biggest applies. Saying so here
          beats a business discovering it from a bill. */}
      <div
        className="mb-5 rounded-[16px] px-4 py-3 text-[13px]"
        style={{ background: "var(--info-soft)", color: "var(--info)" }}
      >
        When campaigns overlap, the <b>biggest multiplier wins</b> — they don't stack. A 2× and a 3× running
        together give 3×, not 6×.
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient px-5 py-10 text-center text-sm text-[var(--muted)]">
          No campaigns yet. Run one to give more points for a weekend, a festival, a slow Tuesday.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-ambient"
              style={{ opacity: c.isActive ? 1 : 0.6 }}
            >
              <span
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)] font-numeral text-lg leading-none"
                style={{
                  background: c.isLive ? "var(--primary)" : "var(--surface-2)",
                  color: c.isLive ? "#fff" : "var(--soft)",
                }}
              >
                {formatMultiplier(c.multiplier)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold text-[var(--ink)]">{c.name}</span>
                  {c.isLive ? (
                    <span
                      className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
                    >
                      <Zap className="h-2.5 w-2.5" />
                      Live
                    </span>
                  ) : !c.isActive ? (
                    <span className="flex-shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--soft)]">
                      Paused
                    </span>
                  ) : (
                    <span className="flex-shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--soft)]">
                      Scheduled
                    </span>
                  )}
                </div>
                <div className="truncate text-[13px] text-[var(--muted)]">{describeSchedule(c)}</div>
                {c.description && (
                  <div className="truncate text-[13px] text-[var(--soft)]">{c.description}</div>
                )}
              </div>

              <button
                onClick={() => toggle(c)}
                className="flex-shrink-0 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]"
              >
                {c.isActive ? "Pause" : "Resume"}
              </button>
              <button
                onClick={() => setModal({ open: true, initial: c })}
                aria-label={`Edit ${c.name}`}
                className="flex-shrink-0 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setConfirmDelete(c)}
                aria-label={`Delete ${c.name}`}
                className="flex-shrink-0 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <CampaignFormModal
        open={modal.open}
        onOpenChange={(open) => setModal((s) => ({ ...s, open }))}
        initial={modal.initial}
        onSaved={() => setModal({ open: false, initial: null })}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        description="Points already earned under it keep their value — the ledger records what each visit was worth at the time. Pause it instead if you might run it again."
        confirmLabel="Delete"
        confirmColor="var(--err)"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete.id);
            toast.success("Campaign deleted.");
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
