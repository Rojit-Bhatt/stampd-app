import { Calendar } from "lucide-react";
import type { TenantEvent } from "../../context/TenantContext";

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface EventCardProps {
  event: Pick<TenantEvent, "title" | "date" | "time" | "location" | "description" | "imageUrl">;
}

export function EventCard({ event }: EventCardProps) {
  return (
    <div className="flex gap-3">
      {event.imageUrl && (
        <img
          src={event.imageUrl}
          alt=""
          className="h-14 w-14 flex-shrink-0 rounded-[var(--radius-field)] object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--brand-ink)" }}>
          <Calendar className="h-3.5 w-3.5" />
          {formatEventDate(event.date)}
          {event.time ? ` · ${event.time}` : ""}
        </div>
        <div className="truncate text-sm font-semibold text-[var(--ink)]">{event.title}</div>
        {event.location && <div className="truncate text-[13px] text-[var(--muted)]">{event.location}</div>}
        {event.description && (
          <div className="truncate text-[13px] text-[var(--muted)]">{event.description}</div>
        )}
      </div>
    </div>
  );
}
