import { useState } from "react";
import { Calendar, MapPin, CalendarDays } from "lucide-react";
import { resolveImageUrl } from "../../lib/images";
import { formatRelativeEventDate } from "../../lib/formatEventDate";
import { buildMapsSearchUrl } from "../../lib/googleMapsLink";
import { EventDetailModal } from "./EventDetailModal";

export interface EventReward {
  rank: string;
  reward: string;
}

export interface EventCardEventData {
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  rewards?: EventReward[];
}

export interface EventBusinessLink {
  label: string;
  to: string;
}

interface EventCardProps {
  event: EventCardEventData;
  businessLink?: EventBusinessLink;
}

// Image on top, details below — a poster, not a list row. Nothing here
// truncates: a description that's too long to show whole is worse than a
// card that grows to fit it (see the menu-card truncation bug this was
// modelled to avoid). Tapping the card (anywhere but the location link)
// opens the full detail sheet.
export function EventCard({ event, businessLink }: EventCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const eventImageUrl = resolveImageUrl(event.imageId, event.imageUrl);
  const mapsUrl = event.location ? buildMapsSearchUrl(event.location) : null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDetailOpen(true);
          }
        }}
        className="cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient"
      >
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
            {formatRelativeEventDate(event.date)}
            {event.time ? ` · ${event.time}` : ""}
          </div>
          <div className="mt-1 text-subhead text-[var(--ink)]">{event.title}</div>
          {event.location && (
            <div className="mt-1 flex items-center gap-1.5 text-footnote text-[var(--muted)]">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="underline-offset-2 hover:underline"
                >
                  {event.location}
                </a>
              ) : (
                <span>{event.location}</span>
              )}
            </div>
          )}
          {event.description && (
            <div className="mt-1.5 whitespace-pre-line text-footnote leading-relaxed text-[var(--muted)]">
              {event.description}
            </div>
          )}
        </div>
      </div>
      <EventDetailModal
        event={event}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        businessLink={businessLink}
      />
    </>
  );
}
