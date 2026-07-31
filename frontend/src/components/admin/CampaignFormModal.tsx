import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Zap } from "lucide-react";
import {
  useCampaignMutations,
  DAY_LABELS,
  type Campaign,
  type CampaignDraft,
} from "../../hooks/useCampaigns";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { CreatePreviewModal } from "../shared/CreatePreviewModal";

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

const draftFrom = (c: Campaign): CampaignDraft => ({
  name: c.name, description: c.description, multiplier: c.multiplier,
  startAt: c.startAt, endAt: c.endAt, daysOfWeek: c.daysOfWeek,
});

// A worked example, not a live figure. The real multiplier resolves at claim
// time in campaignService, not here — and CAMPAIGN_STACKING="max" means an
// overlapping campaign can change the answer. Rs 500 is just a round number
// to anchor the math.
const SAMPLE_BILL = 500;

const KATHMANDU_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  dateStyle: "medium",
  timeStyle: "short",
});

interface CampaignFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Campaign | null;
  onSaved: () => void;
}

export function CampaignFormModal({ open, onOpenChange, initial, onSaved }: CampaignFormModalProps) {
  const { create, update } = useCampaignMutations();
  const { data: settings } = useAdminSettings();
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft());

  useEffect(() => {
    if (open) setDraft(initial ? draftFrom(initial) : emptyDraft());
  }, [open, initial]);

  const busy = create.isPending || update.isPending;

  const save = async () => {
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, patch: draft });
        toast.success("Campaign updated!");
      } else {
        await create.mutateAsync(draft);
        toast.success("Campaign is set!");
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const toggleDay = (d: number) =>
    setDraft((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(d)
        ? prev.daysOfWeek.filter((x) => x !== d)
        : [...prev.daysOfWeek, d],
    }));

  const resolvedEarnPercent = settings?.programResolved.earnPercent ?? 100;
  const base = Math.round((SAMPLE_BILL * resolvedEarnPercent) / 100);
  const boosted = Math.round(base * draft.multiplier);
  const days =
    draft.daysOfWeek.length === 0 || draft.daysOfWeek.length === 7
      ? "Every day"
      : draft.daysOfWeek.slice().sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(", ");

  return (
    <CreatePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit campaign" : "New campaign"}
      saveLabel={initial ? "Save changes" : "Save campaign"}
      busy={busy}
      onCancel={() => onOpenChange(false)}
      onSave={save}
      preview={
        <div className="flex flex-col gap-3">
          <div
            className="flex items-center gap-3 rounded-[var(--radius-card)] px-4 py-3.5"
            style={{ background: "var(--primary)" }}
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20 font-numeral text-base font-bold text-white">
              <Zap className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 text-white">
              <div className="truncate font-bold">{draft.name || "Campaign name"}</div>
              <div className="truncate text-[13px] opacity-90">
                {draft.description || `${draft.multiplier}× points`}
              </div>
            </div>
          </div>

          <p className="text-[13px] text-[var(--muted)]">
            A Rs {SAMPLE_BILL} bill earns{" "}
            <span className="font-numeral text-[var(--primary)]">{boosted}</span> points instead of{" "}
            <span className="font-numeral">{base}</span>.
          </p>
          <p className="text-[12px] text-[var(--soft)]">
            An estimate. The multiplier is worked out when the customer claims, not now — another campaign
            running at the same time can change it.
          </p>

          <div className="border-t border-[var(--line)] pt-3 text-[12px] text-[var(--muted)]">
            <div>{days}</div>
            <div>
              From {KATHMANDU_FORMAT.format(new Date(draft.startAt))}
              {draft.endAt ? ` to ${KATHMANDU_FORMAT.format(new Date(draft.endAt))}` : ""} (Nepal time)
            </div>
          </div>
        </div>
      }
      form={
        <>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name (e.g. Double Weekend)"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <label className="flex items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5">
            <input
              type="number"
              min={1}
              step="0.5"
              value={draft.multiplier}
              onChange={(e) => setDraft({ ...draft, multiplier: Number(e.target.value) })}
              className="w-14 bg-transparent text-sm focus:outline-none"
            />
            <span className="text-sm text-[var(--muted)]">× points</span>
          </label>

          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description (shown to customers)"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
              Starts
              <input
                type="datetime-local"
                value={toLocalInput(draft.startAt)}
                onChange={(e) => setDraft({ ...draft, startAt: fromLocalInput(e.target.value) || draft.startAt })}
                className="mt-1 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
              Ends (optional)
              <input
                type="datetime-local"
                value={toLocalInput(draft.endAt)}
                onChange={(e) => setDraft({ ...draft, endAt: fromLocalInput(e.target.value) })}
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
        </>
      }
    />
  );
}
