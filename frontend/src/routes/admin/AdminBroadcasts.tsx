import { useState } from "react";
import { Plus, Trash2, X, Megaphone } from "lucide-react";
import toast from "@/lib/toast";
import {
  useBroadcasts,
  useBroadcastDetail,
  useBroadcastMutations,
  TIER_LABELS,
  type Broadcast,
  type BroadcastDraft,
} from "../../hooks/useBroadcasts";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

const emptyDraft = (): BroadcastDraft => ({
  channel: "email",
  segmentType: "all",
  segmentTier: null,
  subject: "",
  body: "",
});

function segmentLabel(b: Pick<Broadcast, "segmentType" | "segmentTier">): string {
  return b.segmentType === "all" ? "All customers" : `Reaches ${b.segmentTier}`;
}

function BroadcastFields({ draft, onChange }: { draft: BroadcastDraft; onChange: (next: BroadcastDraft) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <select
          value={draft.channel}
          onChange={(e) => onChange({ ...draft, channel: e.target.value as BroadcastDraft["channel"] })}
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="email">Email</option>
          <option value="push">Push notification</option>
          <option value="sms">SMS</option>
        </select>
        <select
          value={draft.segmentType === "all" ? "all" : draft.segmentTier || ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "all") onChange({ ...draft, segmentType: "all", segmentTier: null });
            else onChange({ ...draft, segmentType: "tier", segmentTier: v as BroadcastDraft["segmentTier"] });
          }}
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="all">All customers</option>
          {TIER_LABELS.map((label) => (
            <option key={label} value={label}>Reaches {label}</option>
          ))}
        </select>
      </div>

      <input
        value={draft.subject}
        onChange={(e) => onChange({ ...draft, subject: e.target.value })}
        placeholder="Subject / title"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <textarea
        value={draft.body}
        onChange={(e) => onChange({ ...draft, body: e.target.value })}
        placeholder="Message"
        rows={4}
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
    </div>
  );
}

function BroadcastDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useBroadcastDetail(id);

  return (
    <div className="shadow-ambient mb-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-[var(--ink)]">{data?.subject || "Loading…"}</h2>
        <button onClick={onClose} className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      {isLoading || !data ? (
        <Skeleton className="h-24 rounded-[var(--radius-card)]" />
      ) : data.recipients.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No one has matched this broadcast yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.recipients.map((r) => (
            <div key={r.userId} className="flex items-center justify-between rounded-[11px] border border-[var(--line)] px-3.5 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-bold text-[var(--ink)]">{r.name}</div>
                <div className="truncate text-[var(--muted)]">{r.email}</div>
              </div>
              <span
                className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                style={
                  r.status === "sent"
                    ? { background: "var(--ok-soft)", color: "var(--ok)" }
                    : r.status === "failed"
                      ? { background: "var(--err-soft)", color: "var(--err)" }
                      : r.status === "cap_reached"
                        ? { background: "var(--warn-soft)", color: "var(--warn)" }
                        : { background: "var(--surface-2)", color: "var(--soft)" }
                }
              >
                {r.status === "no_consent" ? "No consent" : r.status === "cap_reached" ? "Budget reached" : r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminBroadcasts() {
  const { data: broadcasts = [], isLoading } = useBroadcasts();
  const { create, update, remove } = useBroadcastMutations();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<BroadcastDraft>(emptyDraft());
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Broadcast | null>(null);

  const submitNew = async () => {
    try {
      await create.mutateAsync(draft);
      toast.success("Broadcast is live!");
      setDraft(emptyDraft());
      setAdding(false);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const toggle = async (b: Broadcast) => {
    try {
      await update.mutateAsync({ id: b.id, patch: { active: !b.active } });
      toast.success(b.active ? "Broadcast paused." : "Broadcast is back on!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update that — try again.");
    }
  };

  return (
    <div className="max-w-[760px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Broadcasts</h1>
          <p className="text-[var(--muted)]">
            An ongoing message that sends itself the moment a customer matches — no scheduling, nothing to click.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="stamp-interactive flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            <Plus className="h-4 w-4" />
            New broadcast
          </button>
        )}
      </div>

      {adding && (
        <div className="shadow-ambient mb-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-5">
          <BroadcastFields draft={draft} onChange={setDraft} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={submitNew}
              disabled={create.isPending}
              className="stamp-interactive rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {create.isPending ? "Saving…" : "Save broadcast"}
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

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />)}
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient px-5 py-10 text-center text-sm text-[var(--muted)]">
          No broadcasts yet. Create one to reach customers automatically as they hit a tier or join.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {broadcasts.map((b) => (
            <div key={b.id}>
              <div
                className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-ambient"
                style={{ opacity: b.active ? 1 : 0.6 }}
              >
                <span
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)]"
                  style={{ background: "var(--surface-2)", color: "var(--soft)" }}
                >
                  <Megaphone className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpenDetailId(openDetailId === b.id ? null : b.id)}>
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold text-[var(--ink)]">{b.subject}</span>
                    <span className="flex-shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--soft)]">
                      {b.channel}
                    </span>
                    {!b.active && (
                      <span className="flex-shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--soft)]">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[13px] text-[var(--muted)]">{segmentLabel(b)}</div>
                  <div className="mt-1 flex gap-3 text-[12px] text-[var(--soft)]">
                    <span>{b.sentCount} sent</span>
                    <span>{b.failedCount} failed</span>
                    <span>{b.noConsentCount} no consent</span>
                  </div>
                </div>

                <button
                  onClick={() => toggle(b)}
                  className="flex-shrink-0 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]"
                >
                  {b.active ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => setConfirmDelete(b)}
                  aria-label={`Delete ${b.subject}`}
                  className="flex-shrink-0 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {openDetailId === b.id && <BroadcastDetailPanel id={b.id} onClose={() => setOpenDetailId(null)} />}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.subject}"?`}
        description="This removes its send history too. Pause it instead if you might want it again."
        confirmLabel="Delete"
        confirmColor="var(--err)"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete.id);
            toast.success("Broadcast deleted.");
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
