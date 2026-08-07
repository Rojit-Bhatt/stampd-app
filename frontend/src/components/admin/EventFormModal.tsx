import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "@/lib/toast";
import { apiRequest } from "../../lib/api";
import { resolveImageUrl } from "../../lib/images";
import { CreatePreviewModal } from "../shared/CreatePreviewModal";
import { FileDrop } from "../shared/FileDrop";
import { EventCard } from "../customer/EventCard";

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
}

const emptyDraft = (): Draft => ({
  title: "", date: "", time: "", location: "", description: "", imageUrl: "", imageId: null,
});

const draftFrom = (e: AdminEventItem): Draft => ({
  title: e.title,
  date: e.date.slice(0, 10),
  time: e.time,
  location: e.location,
  description: e.description,
  imageUrl: e.imageUrl,
  imageId: e.imageId,
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

  const save = async () => {
    if (!draft.title.trim() || !draft.date) {
      toast.error("An event needs a title and a date.");
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
      preview={<EventCard event={previewEvent} />}
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
          <input
            value={draft.time}
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            placeholder="Time (e.g. 7:00 PM)"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder="Location"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description"
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
        </div>
      }
    />
  );
}
