import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";

import { useExploreEvents, type ExploreEvent } from "../hooks/useExploreEvents";
import { tenantPath } from "../lib/tenantPath";
import { EventCard } from "../components/customer/EventCard";
import { Skeleton } from "../components/ui/skeleton";

// The events counterpart to ExploreMine: a flat, slug-less list rather than
// a filterable grid, because date is the only ordering this surface offers
// (see the design doc — Discover already owns search/category/distance).
export default function ExploreEvents() {
  const { data: events = [], isLoading } = useExploreEvents();

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Events</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          Upcoming events from every business on Stampd.
        </p>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px] w-full rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-12 text-center shadow-ambient">
          <CalendarDays className="mx-auto h-7 w-7 text-[var(--soft)]" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-[var(--muted)]">
            No upcoming events yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <EventListingCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

// Local, not a shared component: the only thing this adds beyond EventCard
// itself is "which business is this" — necessary here because the feed
// mixes many outlets on one screen, unlike EventCard's other caller
// (CustomerDashboard, already inside one outlet's context).
function EventListingCard({ event }: { event: ExploreEvent }) {
  const initial = event.businessName.charAt(0).toUpperCase();
  return (
    <Link
      to={tenantPath(event.companySlug, event.slug, "dashboard")}
      className="stamp-interactive relative block"
    >
      {/* Overlaid on the card's own image, top-left — which business, without
          wrapping EventCard in a second card. */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 py-1 pl-1 pr-2.5 backdrop-blur-sm">
        {event.branding.logoUrl ? (
          <img
            src={event.branding.logoUrl}
            alt=""
            className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: event.branding.primaryColor }}
          >
            {initial}
          </div>
        )}
        <span className="truncate text-[11px] font-bold text-white">{event.businessName}</span>
      </div>
      <EventCard event={event} />
    </Link>
  );
}
