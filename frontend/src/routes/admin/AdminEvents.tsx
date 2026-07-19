import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Pencil, X, Check } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

interface EventItem {
  id?: string;
  _id?: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
}

const eventId = (e: EventItem) => e.id || (e._id as string);

const EMPTY_DRAFT = { title: "", date: "", time: "", location: "", description: "", imageUrl: "" };

function useEvents() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<EventItem[]>({
    queryKey: ["adminEvents", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; events: EventItem[] }>("/api/admin/events", {
        role: "admin",
      });
      return res.events || [];
    },
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function EventFields({
  draft,
  onChange,
}: {
  draft: typeof EMPTY_DRAFT;
  onChange: (next: typeof EMPTY_DRAFT) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <input
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder="Title"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <input
        type="date"
        value={draft.date}
        onChange={(e) => onChange({ ...draft, date: e.target.value })}
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <input
        value={draft.time}
        onChange={(e) => onChange({ ...draft, time: e.target.value })}
        placeholder="Time (e.g. 7:00 PM)"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <input
        value={draft.location}
        onChange={(e) => onChange({ ...draft, location: e.target.value })}
        placeholder="Location"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <input
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        placeholder="Description"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none sm:col-span-2"
      />
      <input
        value={draft.imageUrl}
        onChange={(e) => onChange({ ...draft, imageUrl: e.target.value })}
        placeholder="Image URL"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none sm:col-span-2"
      />
    </div>
  );
}

export default function AdminEvents() {
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useEvents();

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminEvents"] });

  const createEvent = useMutation({
    mutationFn: (body: typeof draft) =>
      apiRequest("/api/admin/events", { method: "POST", role: "admin", body }),
    onSuccess: () => {
      invalidate();
      setDraft(EMPTY_DRAFT);
      toast.success("Event added!");
    },
    onError: (e) => toast.error((e as Error).message || "Couldn't add that — try again."),
  });

  const patchEvent = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof draft }) =>
      apiRequest(`/api/admin/events/${id}`, { method: "PATCH", role: "admin", body }),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast.success("Event updated!");
    },
    onError: (e) => toast.error((e as Error).message || "Couldn't update that — try again."),
  });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/events/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: () => {
      invalidate();
      toast.success("Event removed.");
    },
  });

  const startEdit = (e: EventItem) => {
    setEditingId(eventId(e));
    setEditDraft({
      title: e.title,
      date: e.date.slice(0, 10),
      time: e.time,
      location: e.location,
      description: e.description,
      imageUrl: e.imageUrl,
    });
  };

  return (
    <div className="max-w-[720px]">
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Events</h1>
      <p className="mb-5 text-[var(--muted)]">Announce upcoming events to your customers.</p>

      {/* Add event */}
      <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
        <div className="mb-3 text-sm font-bold">Add an event</div>
        <EventFields draft={draft} onChange={setDraft} />
        <button
          onClick={() => draft.title.trim() && draft.date && createEvent.mutate(draft)}
          disabled={createEvent.isPending || !draft.title.trim() || !draft.date}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[11px] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--primary)" }}
        >
          <Plus className="h-4 w-4" /> Add event
        </button>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <Skeleton className="mb-1.5 h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-8 w-8 rounded-[9px]" />
              <Skeleton className="h-8 w-8 rounded-[9px]" />
            </div>
          ))
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted)]">No events yet. Add your first above.</div>
        ) : (
          events.map((e) => {
            const id = eventId(e);
            if (editingId === id) {
              return (
                <div key={id} className="border-b border-[var(--line)] p-4 last:border-b-0">
                  <EventFields draft={editDraft} onChange={setEditDraft} />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => patchEvent.mutate({ id, body: editDraft })}
                      disabled={patchEvent.isPending}
                      className="inline-flex items-center gap-1.5 rounded-[11px] px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: "var(--primary)" }}
                    >
                      <Check className="h-4 w-4" /> Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2 text-sm font-bold"
                    >
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={id} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0">
                {e.imageUrl && (
                  <img src={e.imageUrl} alt="" className="h-12 w-12 flex-shrink-0 rounded-[10px] object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{e.title}</div>
                  <div className="truncate text-[13px] text-[var(--muted)]">
                    {formatDate(e.date)}
                    {e.time ? ` · ${e.time}` : ""}
                    {e.location ? ` · ${e.location}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)]"
                  aria-label={`Edit ${e.title}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPendingDeleteId(id)}
                  className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--err)]"
                  aria-label={`Delete ${e.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete this event?"
        description={
          pendingDeleteId
            ? `"${events.find((e) => eventId(e) === pendingDeleteId)?.title ?? ""}" will be removed and no longer shown to customers.`
            : ""
        }
        confirmLabel="Delete"
        confirmColor="var(--err)"
        onConfirm={() => {
          if (pendingDeleteId) deleteEvent.mutate(pendingDeleteId);
        }}
      />
    </div>
  );
}
