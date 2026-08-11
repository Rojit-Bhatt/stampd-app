import { useState } from "react";
import { Link } from "react-router-dom";
import { X, Calendar, MapPin, CalendarDays, Trophy, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMotion } from "../../lib/motion";
import { resolveImageUrl } from "../../lib/images";
import { formatRelativeEventDate } from "../../lib/formatEventDate";
import { buildMapsSearchUrl } from "../../lib/googleMapsLink";
import { EventImageViewer } from "./EventImageViewer";
import type { EventCardEventData, EventBusinessLink } from "./EventCard";

interface EventDetailModalProps {
  event: EventCardEventData;
  open: boolean;
  onClose: () => void;
  businessLink?: EventBusinessLink;
}

export function EventDetailModal({ event, open, onClose, businessLink }: EventDetailModalProps) {
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const m = useMotion();
  const eventImageUrl = resolveImageUrl(event.imageId, event.imageUrl);
  const mapsUrl = event.location ? buildMapsSearchUrl(event.location) : null;
  const rewards = event.rewards ?? [];
  const exactDate = new Date(event.date).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={event.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={m.ease("ui")}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
            onClick={onClose}
          >
            <motion.div
              initial={m.pick({ y: "100%" }, { opacity: 0 })}
              animate={m.pick({ y: 0 }, { opacity: 1 })}
              exit={m.pick({ y: "100%" }, { opacity: 0 })}
              transition={m.spring("settle")}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-t-[var(--radius-card)] bg-[var(--surface)] sm:rounded-[var(--radius-card)]"
            >
              <div className="relative">
                {eventImageUrl ? (
                  <img
                    src={eventImageUrl}
                    alt=""
                    onClick={() => setImageViewerOpen(true)}
                    className="h-56 w-full cursor-zoom-in object-cover"
                  />
                ) : (
                  <div
                    className="flex h-56 w-full items-center justify-center"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <CalendarDays className="h-10 w-10 text-[var(--soft)]" strokeWidth={1.5} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>

              <div className="p-5">
                <div className="flex items-center gap-1.5 text-caption" style={{ color: "var(--brand-ink)" }}>
                  <Calendar className="h-3.5 w-3.5" />
                  {formatRelativeEventDate(event.date)}
                  {event.time ? ` · ${event.time}` : ""}
                </div>
                <div className="mt-0.5 text-footnote text-[var(--soft)]">{exactDate}</div>
                <div className="mt-2 text-title-2 text-[var(--ink)]">{event.title}</div>

                {event.location && (
                  <div className="mt-2 flex items-center gap-1.5 text-footnote text-[var(--muted)]">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    {mapsUrl ? (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
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
                  <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">
                    {event.description}
                  </div>
                )}

                {rewards.length > 0 && (
                  <div className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface-2)] p-3.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--soft)]">
                      <Trophy className="h-3.5 w-3.5" />
                      Rewards
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {rewards.map((r, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-semibold text-[var(--ink)]">{r.rank}</span>
                          <span className="text-right text-[var(--muted)]">{r.reward}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {businessLink && (
                  <Link
                    to={businessLink.to}
                    onClick={onClose}
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-[var(--primary)] py-2.5 text-sm font-bold text-white"
                  >
                    Visit {businessLink.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {eventImageUrl && (
        <EventImageViewer
          imageUrl={eventImageUrl}
          alt={event.title}
          open={imageViewerOpen}
          onClose={() => setImageViewerOpen(false)}
        />
      )}
    </>
  );
}
