import { useRef, useState } from "react";
import { Calendar, MapPin, CalendarDays, Move } from "lucide-react";
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
  /** Vertical crop anchor (0 = top of photo visible, 100 = bottom visible) for the cropped card thumbnail. */
  imagePositionY?: number;
  rewards?: EventReward[];
}

export interface EventBusinessLink {
  label: string;
  to: string;
}

interface EventCardProps {
  event: EventCardEventData;
  businessLink?: EventBusinessLink;
  /**
   * Presence makes this a live edit preview instead of a customer-facing
   * card: the whole-card tap-to-open-detail behavior is disabled, and the
   * poster image becomes vertically drag-adjustable, reporting the new
   * 0-100 anchor here as the admin drags.
   */
  onImagePositionChange?: (y: number) => void;
}

// Image on top, details below — a poster, not a list row. Nothing here
// truncates: a description that's too long to show whole is worse than a
// card that grows to fit it (see the menu-card truncation bug this was
// modelled to avoid). Tapping the card (anywhere but the location link)
// opens the full detail sheet — unless it's an edit preview, see
// onImagePositionChange above.
export function EventCard({ event, businessLink, onImagePositionChange }: EventCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const eventImageUrl = resolveImageUrl(event.imageId, event.imageUrl);
  const mapsUrl = event.location ? buildMapsSearchUrl(event.location) : null;
  const editable = !!onImagePositionChange;
  const drag = useRef<{ startY: number; startPosition: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onImagePositionChange) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startPosition: event.imagePositionY ?? 50 };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onImagePositionChange || !drag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Cropped (object-cover) image: dragging the photo down should reveal
    // more of its top edge, same direct-manipulation feel as an Instagram
    // crop — so downward drag DECREASES the position anchor.
    const deltaPercent = ((e.clientY - drag.current.startY) / rect.height) * 100;
    const next = Math.round(drag.current.startPosition - deltaPercent);
    onImagePositionChange(Math.max(0, Math.min(100, next)));
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onImagePositionChange) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <>
      <div
        role={editable ? undefined : "button"}
        tabIndex={editable ? undefined : 0}
        onClick={editable ? undefined : () => setDetailOpen(true)}
        onKeyDown={
          editable
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDetailOpen(true);
                }
              }
        }
        className={`overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient ${editable ? "" : "cursor-pointer"}`}
      >
        {eventImageUrl ? (
          <div
            className={`relative h-36 w-full overflow-hidden ${editable ? "touch-none cursor-ns-resize" : ""}`}
            style={{ background: "var(--surface-2)" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img
              src={eventImageUrl}
              alt=""
              draggable={false}
              className="h-full w-full select-none object-cover"
              style={{ objectPosition: `center ${event.imagePositionY ?? 50}%` }}
            />
            {editable && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/45 py-1 text-caption text-white">
                <Move className="h-3 w-3" strokeWidth={2} />
                Drag to reposition
              </div>
            )}
          </div>
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
      {!editable && (
        <EventDetailModal
          event={event}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          businessLink={businessLink}
        />
      )}
    </>
  );
}
