import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import toast from "@/lib/toast";
import { apiRequest } from "../../lib/api";
import { resolveImageUrl } from "../../lib/images";
import { CreatePreviewModal } from "../shared/CreatePreviewModal";
import { FileDrop } from "../shared/FileDrop";
import { TimePicker } from "../ui/TimePicker";
import { Switch } from "../ui/switch";
import { EventCard, type EventReward } from "../customer/EventCard";

export interface AdminEventItem {
  id?: string;
  _id?: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  imagePositionY: number;
  rewards: EventReward[];
}

export const eventId = (e: AdminEventItem) => e.id || (e._id as string);

interface Draft {
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  imagePositionY: number;
  rewards: EventReward[];
}

const emptyDraft = (): Draft => ({
  title: "", date: "", time: "", location: "", description: "", imageUrl: "", imageId: null,
  imagePositionY: 50, rewards: [],
});

const draftFrom = (e: AdminEventItem): Draft => ({
  title: e.title,
  date: e.date.slice(0, 10),
  time: e.time,
  location: e.location,
  description: e.description,
  imageUrl: e.imageUrl,
  imageId: e.imageId,
  imagePositionY: e.imagePositionY ?? 50,
  rewards: e.rewards || [],
});

interface EventFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdminEventItem | null;
  onSaved: () => void;
}

export function EventFormModal({ open, onOpenChange, initial, onSaved }: EventFormModalProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  useEffect(() => {
    if (open) setDraft(initial ? draftFrom(initial) : emptyDraft());
  }, [open, initial]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminEvents"] });

  const create = useMutation({
    mutationFn: (body: Draft) => apiRequest("/api/admin/events", { method: "POST", role: "admin", body }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Draft }) =>
      apiRequest(`/api/admin/events/${id}`, { method: "PATCH", role: "admin", body }),
    onSuccess: invalidate,
  });

  const busy = create.isPending || update.isPending;

  const updateReward = (index: number, field: keyof EventReward, value: string) => {
    setDraft((d) => ({
      ...d,
      rewards: d.rewards.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    }));
  };
  const addReward = () => setDraft((d) => ({ ...d, rewards: [...d.rewards, { rank: "", reward: "" }] }));
  const removeReward = (index: number) =>
    setDraft((d) => ({ ...d, rewards: d.rewards.filter((_, i) => i !== index) }));

  const save = async () => {
    if (!draft.title.trim() || !draft.date) {
      toast.error("An event needs a title and a date.");
      return;
    }
    if (draft.rewards.some((r) => !r.rank.trim() || !r.reward.trim())) {
      toast.error("Fill in both fields for every reward, or remove the empty row.");
      return;
    }
    try {
      if (initial) {
        await update.mutateAsync({ id: eventId(initial), body: draft });
        toast.success("Event updated!");
      } else {
        await create.mutateAsync(draft);
        toast.success("Event added!");
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const previewEvent = {
    title: draft.title || "Event title",
    date: draft.date || new Date().toISOString(),
    time: draft.time,
    location: draft.location || "Where it happens",
    description: draft.description || "A short description customers will see.",
    imageUrl: resolveImageUrl(draft.imageId, draft.imageUrl),
    imageId: null,
    imagePositionY: draft.imagePositionY,
    rewards: draft.rewards,
  };

  return (
    <CreatePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit event" : "New event"}
      saveLabel={initial ? "Save changes" : "Save event"}
      busy={busy}
      onCancel={() => onOpenChange(false)}
      onSave={save}
      preview={
        <EventCard
          event={previewEvent}
          onImagePositionChange={(imagePositionY) => setDraft((d) => ({ ...d, imagePositionY }))}
        />
      }
      form={
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Title"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <TimePicker value={draft.time} onChange={(time) => setDraft({ ...draft, time })} />
          <input
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder="e.g. Your Cafe Name, Neighborhood, City"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description, rules, what to expect…"
            rows={3}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <FileDrop
              mode="image"
              ownerType="event"
              previewUrl={resolveImageUrl(draft.imageId, draft.imageUrl)}
              onImageUploaded={({ id }) => setDraft((d) => ({ ...d, imageId: id }))}
              onRemove={() => setDraft((d) => ({ ...d, imageId: null, imageUrl: "" }))}
              label="Click to choose a photo, or drag one here"
            />
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between rounded-[11px] border border-[var(--line)] px-3.5 py-2.5">
              <span className="text-sm font-semibold text-[var(--ink)]">This event has rewards</span>
              <Switch
                checked={draft.rewards.length > 0}
                onCheckedChange={(checked) =>
                  setDraft((d) => ({ ...d, rewards: checked ? [{ rank: "", reward: "" }] : [] }))
                }
              />
            </div>
            {draft.rewards.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {draft.rewards.map((reward, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={reward.rank}
                      onChange={(e) => updateReward(index, "rank", e.target.value)}
                      placeholder="1st Place"
                      className="w-1/3 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                    />
                    <input
                      value={reward.reward}
                      onChange={(e) => updateReward(index, "reward", e.target.value)}
                      placeholder="NPR 5,000 + Trophy"
                      className="flex-1 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeReward(index)}
                      aria-label="Remove reward"
                      className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[11px] border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addReward}
                  className="flex items-center gap-1.5 self-start text-sm font-semibold text-[var(--primary-deep)]"
                >
                  <Plus className="h-4 w-4" />
                  Add another reward
                </button>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}
