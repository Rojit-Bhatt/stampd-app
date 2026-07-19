import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check, Zap } from "lucide-react";
import toast from "react-hot-toast";
import {
  useCampaigns,
  useCampaignMutations,
  formatMultiplier,
  describeSchedule,
  DAY_LABELS,
  type Campaign,
  type CampaignDraft,
} from "../../hooks/useCampaigns";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

// <input type="datetime-local"> speaks "YYYY-MM-DDTHH:mm" in the BROWSER's
// zone and the server stores an absolute instant, so these two functions are
// the only place the two representations meet.
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

const emptyDraft = (): CampaignDraft => ({
  name: "",
  description: "",
  multiplier: 2,
  startAt: new Date().toISOString(),
  endAt: null,
  daysOfWeek: [],
});

function CampaignFields({
  draft,
  onChange,
}: {
  draft: CampaignDraft;
  onChange: (next: CampaignDraft) => void;
}) {
  const toggleDay = (d: number) =>
    onChange({
      ...draft,
      daysOfWeek: draft.daysOfWeek.includes(d)
        ? draft.daysOfWeek.filter((x) => x !== d)
        : [...draft.daysOfWeek, d],
    });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[2fr_1fr]">
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Name (e.g. Double Weekend)"
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <label className="flex items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5">
          <input
            type="number"
            min={1}
            step="0.5"
            value={draft.multiplier}
            onChange={(e) => onChange({ ...draft, multiplier: Number(e.target.value) })}
            className="w-14 bg-transparent text-sm focus:outline-none"
          />
          <span className="text-sm text-[var(--muted)]">× points</span>
        </label>
      </div>

      <input
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        placeholder="Description (shown to customers)"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
          Starts
          <input
            type="datetime-local"
            value={toLocalInput(draft.startAt)}
            onChange={(e) => onChange({ ...draft, startAt: fromLocalInput(e.target.value) || draft.startAt })}
            className="mt-1 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
          />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
          Ends (optional)
          <input
            type="datetime-local"
            value={toLocalInput(draft.endAt)}
            onChange={(e) => onChange({ ...draft, endAt: fromLocalInput(e.target.value) })}
            className="mt-1 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
          />
        </label>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
          Only on these days
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map((label, d) => {
            const on = draft.daysOfWeek.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors"
                style={
                  on
                    ? { background: "var(--primary)", color: "#fff" }
                    : { background: "var(--surface-2)", color: "var(--muted)" }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12px] text-[var(--muted)]">
          Leave all off to run every day. Days are judged in Nepal time.
        </p>
      </div>
    </div>
  );
}

// Campaigns change what a bill is worth. Events (a separate page) are
// display-only listings — deliberately kept apart so nobody sets up a poster
// and wonders why points didn't double.
export default function AdminCampaigns() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { create, update, remove } = useCampaignMutations();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CampaignDraft>(emptyDraft());
  const [confirmDelete, setConfirmDelete] = useState<Campaign | null>(null);

  const liveCount = campaigns.filter((c) => c.isLive).length;

  const submitNew = async () => {
    try {
      await create.mutateAsync(draft);
      toast.success("Campaign is set!");
      setDraft(emptyDraft());
      setAdding(false);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const submitEdit = async (id: string) => {
    try {
      await update.mutateAsync({ id, patch: editDraft });
      toast.success("Campaign updated!");
      setEditingId(null);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const toggle = async (c: Campaign) => {
    try {
      await update.mutateAsync({ id: c.id, patch: { isActive: !c.isActive } });
      toast.success(c.isActive ? "Campaign paused." : "Campaign is back on!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update that — try again.");
    }
  };

  const startEdit = (c: Campaign) => {
    setEditingId(c.id);
    setEditDraft({
      name: c.name,
      description: c.description,
      multiplier: c.multiplier,
      startAt: c.startAt,
      endAt: c.endAt,
      daysOfWeek: c.daysOfWeek,
    });
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
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="stamp-interactive flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            <Plus className="h-4 w-4" />
            New campaign
          </button>
        )}
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

      {adding && (
        <div className="shadow-ambient mb-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-5">
          <CampaignFields draft={draft} onChange={setDraft} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={submitNew}
              disabled={create.isPending}
              className="stamp-interactive rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {create.isPending ? "Saving…" : "Save campaign"}
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
      ) : campaigns.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient px-5 py-10 text-center text-sm text-[var(--muted)]">
          No campaigns yet. Run one to give more points for a weekend, a festival, a slow Tuesday.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
                <CampaignFields draft={editDraft} onChange={setEditDraft} />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => submitEdit(c.id)}
                    disabled={update.isPending}
                    className="stamp-interactive flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
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
                  onClick={() => startEdit(c)}
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
            ),
          )}
        </div>
      )}

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
