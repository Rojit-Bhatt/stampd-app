import { Calendar, MapPin, CalendarDays } from "lucide-react";
import type { TenantEvent } from "../../context/TenantContext";
import { resolveImageUrl } from "../../lib/images";

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface EventCardProps {
  event: Pick<TenantEvent, "title" | "date" | "time" | "location" | "description" | "imageUrl" | "imageId">;
}

// Image on top, details below — a poster, not a list row. Nothing here
// truncates: a description that's too long to show whole is worse than a
// card that grows to fit it (see the menu-card truncation bug this was
// modelled to avoid).
export function EventCard({ event }: EventCardProps) {
  const eventImageUrl = resolveImageUrl(event.imageId, event.imageUrl);
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient">
      {eventImageUrl ? (
        <img src={eventImageUrl} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div
          className="flex h-36 w-full items-center justify-center"
          style={{ background: "var(--surface-2)" }}
        >
          <CalendarDays className="h-8 w-8 text-[var(--soft)]" strokeWidth={1.5} />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-1.5 text-caption" style={{ color: "var(--brand-ink)" }}>
          <Calendar className="h-3.5 w-3.5" />
          {formatEventDate(event.date)}
          {event.time ? ` · ${event.time}` : ""}
        </div>
        <div className="mt-1 text-subhead text-[var(--ink)]">{event.title}</div>
        {event.location && (
          <div className="mt-1 flex items-center gap-1.5 text-footnote text-[var(--muted)]">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
        {event.description && (
          <div className="mt-1.5 whitespace-pre-line text-footnote leading-relaxed text-[var(--muted)]">
            {event.description}
          </div>
        )}
      </div>
    </div>
  );
}
