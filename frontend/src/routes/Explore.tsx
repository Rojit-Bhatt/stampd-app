import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, Store, X } from "lucide-react";

import { useDiscover, type DiscoverBusiness } from "../hooks/useDiscover";
import { tenantPath } from "../lib/tenantPath";
import { BUSINESS_CATEGORIES, type BusinessCategory } from "../hooks/useAdminSettings";
import { distanceKm } from "../lib/geo";
import { darken } from "../lib/color";
import { resolveImageUrl } from "../lib/images";
import { Skeleton } from "../components/ui/skeleton";
import { InstallAppPrompt } from "../components/customer/InstallAppPrompt";
import { OutletCardStack } from "../components/customer/OutletCardStack";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  bakery: "Bakery",
  salon: "Salon",
  gym: "Gym",
  retail: "Retail",
  other: "Other",
};

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const PILL_CATEGORIES = BUSINESS_CATEGORIES.filter((c) => c !== "other");

// The cross-tenant home. This screen is slug-less and carries Stampd's OWN
// identity — no outlet themes it, because it belongs to none of them.
//
// Ordering is real signal only: measured distance when the customer grants
// location, otherwise genuine recent points movement. There are no ratings,
// no "deals", and no badges the platform can't stand behind.
export default function Explore() {
  const { data: businesses = [], isLoading } = useDiscover();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BusinessCategory | "all">("all");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
  };

  const distanceFor = (b: DiscoverBusiness) =>
    coords && b.contact.latitude != null && b.contact.longitude != null
      ? distanceKm(coords.lat, coords.lon, b.contact.latitude, b.contact.longitude)
      : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = businesses.filter((b) => {
      if (category !== "all" && b.category !== category) return false;
      if (q && !b.name.toLowerCase().includes(q)) return false;
      return true;
    });

    if (coords) {
      return [...list].sort((a, b) => {
        const da =
          a.contact.latitude != null && a.contact.longitude != null
            ? distanceKm(coords.lat, coords.lon, a.contact.latitude, a.contact.longitude)
            : Infinity;
        const db =
          b.contact.latitude != null && b.contact.longitude != null
            ? distanceKm(coords.lat, coords.lon, b.contact.latitude, b.contact.longitude)
            : Infinity;
        // Businesses with no coordinates fall to the bottom, ranked among
        // themselves by real activity rather than arbitrarily.
        if (da === Infinity && db === Infinity) return b.recentActivityCount - a.recentActivityCount;
        return da - db;
      });
    }
    return [...list].sort((a, b) => b.recentActivityCount - a.recentActivityCount);
  }, [businesses, query, category, coords]);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6">
      {/* Only renders when the browser says the app is actually installable
          and the customer hasn't dismissed it. */}
      <InstallAppPrompt className="mb-6" />

      <OutletCardStack />

      <h2 className="mb-3 text-title-2 text-[var(--ink)]">Discover</h2>

      {/* Apple's "prominent" search style: a filled pill, no border, the
          magnifying glass and (once there's text) a clear button both inset
          inside it — not the shared Input's bordered rectangle, which stays
          as-is for forms elsewhere in the app. */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--soft)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search businesses…"
          aria-label="Search businesses"
          className="h-11 w-full rounded-full border-0 bg-[var(--surface-2)] pl-10 pr-10 text-[15px] text-[var(--ink)] placeholder:text-[var(--soft)] transition-colors focus-visible:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--surface-2)] transition-colors hover:bg-[var(--muted)]"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="mb-5 flex items-center gap-2">
        <div className="hide-scrollbar flex flex-1 gap-2 overflow-x-auto">
          {(["all", ...PILL_CATEGORIES] as const).map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={active}
                className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                  active
                    ? "bg-[var(--ink)] text-[var(--bg)]"
                    : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {c === "all" ? "All" : CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>
        <button
          onClick={requestLocation}
          disabled={locating}
          aria-label={coords ? "Sorted by distance from you" : "Sort by distance from me"}
          aria-pressed={Boolean(coords)}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50 ${
            coords
              ? "bg-[var(--primary-soft)] text-[var(--primary-deep)]"
              : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          <MapPin className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[200px] w-full rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-12 text-center">
          <Store className="mx-auto h-7 w-7 text-[var(--soft)]" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-[var(--muted)]">
            {query || category !== "all"
              ? "No businesses match that. Try a different search or category."
              : "No businesses are listed yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <BusinessCard key={b.id} business={b} distanceKm={distanceFor(b)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BusinessCard({
  business,
  distanceKm: km,
}: {
  business: DiscoverBusiness;
  distanceKm: number | null;
}) {
  const isNew = Date.now() - new Date(business.createdAt).getTime() < NEW_WINDOW_MS;
  const initial = business.name.charAt(0).toUpperCase();

  return (
    <Link
      // Both slugs, always. An outlet slug is unique only within its company,
      // so a single-segment path resolves to a company (or to nothing) rather
      // than to this outlet.
      to={tenantPath(business.companySlug, business.slug, "dashboard")}
      className="stamp-interactive group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient"
    >
      <div
        className="flex h-28 items-end p-4"
        style={
          resolveImageUrl(business.branding.bannerImageId, business.branding.bannerUrl)
            ? {
                backgroundImage: `url(${resolveImageUrl(business.branding.bannerImageId, business.branding.bannerUrl)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {
                background: `linear-gradient(150deg, ${business.branding.primaryColor}, ${darken(business.branding.primaryColor)})`,
              }
        }
      >
        {resolveImageUrl(business.branding.logoImageId, business.branding.logoUrl) ? (
          <img
            src={resolveImageUrl(business.branding.logoImageId, business.branding.logoUrl)}
            alt=""
            className="h-11 w-11 rounded-[var(--radius-field)] bg-white object-cover shadow-modal"
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-field)] bg-white font-display text-lg font-bold shadow-modal"
            style={{ color: business.branding.primaryColor }}
          >
            {initial}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-display text-base font-bold text-[var(--ink)]">
          {business.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* Distance only when it was actually measured — never estimated. */}
          {km !== null && (
            <Badge variant="neutral">{km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</Badge>
          )}
          <Badge variant="outline">{CATEGORY_LABELS[business.category]}</Badge>
          {isNew && <Badge variant="active">New</Badge>}
        </div>
      </div>
    </Link>
  );
}
