import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Trash2, Plus, Pencil } from "lucide-react";
import toast from "@/lib/toast";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { EventFormModal, eventId, type AdminEventItem } from "../../components/admin/EventFormModal";

function useEvents() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<AdminEventItem[]>({
    queryKey: ["adminEvents", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; events: AdminEventItem[] }>("/api/admin/events", {
        role: "admin",
      });
      return res.events || [];
    },
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminEvents() {
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useEvents();

  const [modal, setModal] = useState<{ open: boolean; initial: AdminEventItem | null }>({
    open: false,
    initial: null,
  });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminEvents"] });

  const deleteEvent = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/events/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: () => {
      invalidate();
      toast.success("Event removed.");
    },
  });

  return (
    <div className="max-w-[720px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Events</h1>
          <p className="text-[var(--muted)]">Announce upcoming events to your customers.</p>
        </div>
        <button
          onClick={() => setModal({ open: true, initial: null })}
          className="inline-flex items-center gap-1.5 rounded-[11px] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--primary)" }}
        >
          <Plus className="h-4 w-4" /> Add event
        </button>
      </div>

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
                  onClick={() => setModal({ open: true, initial: e })}
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

      <EventFormModal
        open={modal.open}
        onOpenChange={(open) => setModal((s) => ({ ...s, open }))}
        initial={modal.initial}
        onSaved={() => setModal({ open: false, initial: null })}
      />

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
