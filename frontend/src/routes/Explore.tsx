import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, Coins } from "lucide-react";
import { useDiscover, type DiscoverBusiness } from "../hooks/useDiscover";
import { useMyTenants } from "../hooks/useMyTenants";
import { formatPoints } from "../hooks/usePoints";
import { tenantPath } from "../lib/tenantPath";
import { BUSINESS_CATEGORIES, type BusinessCategory } from "../hooks/useAdminSettings";
import { distanceKm } from "../lib/geo";
import { darken } from "../lib/color";
import { Skeleton } from "../components/ui/skeleton";

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

export default function Explore() {
  const { data: myTenants = [] } = useMyTenants();
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = businesses.filter((b) => {
      if (category !== "all" && b.category !== category) return false;
      if (q && !b.name.toLowerCase().includes(q)) return false;
      return true;
    });

    if (coords) {
      list = [...list].sort((a, b) => {
        const da =
          a.contact.latitude != null && a.contact.longitude != null
            ? distanceKm(coords.lat, coords.lon, a.contact.latitude, a.contact.longitude)
            : Infinity;
        const db =
          b.contact.latitude != null && b.contact.longitude != null
            ? distanceKm(coords.lat, coords.lon, b.contact.latitude, b.contact.longitude)
            : Infinity;
        if (da === Infinity && db === Infinity) return b.recentActivityCount - a.recentActivityCount;
        return da - db;
      });
    } else {
      list = [...list].sort((a, b) => b.recentActivityCount - a.recentActivityCount);
    }

    return list;
  }, [businesses, query, category, coords]);

  return (
    <div className="px-5 py-6">
      {myTenants.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 font-display text-xl font-bold text-[var(--ink)]">My Places</h2>
          <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-1">
            {myTenants.map((m) => (
              <Link
                key={m.organizationId}
                to={tenantPath(m.companySlug, m.slug, "dashboard")}
                className="stamp-interactive shadow-ambient min-w-[180px] flex-shrink-0 rounded-3xl bg-[var(--surface-container)] p-4"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-bold" style={{ color: m.branding.primaryColor }}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="truncate font-bold text-[var(--ink)]">{m.name}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {formatPoints(m.balance)} points
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 font-display text-xl font-bold text-[var(--ink)]">Discover</h2>

      <div className="mb-3 flex items-center gap-2 rounded-2xl bg-[var(--surface-container)] px-4 py-3">
        <Search className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search businesses…"
          className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
        />
      </div>

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="hide-scrollbar flex gap-2 overflow-x-auto">
          <button
            onClick={() => setCategory("all")}
            className="flex-shrink-0 rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap"
            style={
              category === "all"
                ? { background: "var(--brand)", color: "#fff" }
                : { background: "var(--surface-container)", color: "var(--muted)" }
            }
          >
            All
          </button>
          {PILL_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="flex-shrink-0 rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap"
              style={
                category === c
                  ? { background: "var(--brand)", color: "#fff" }
                  : { background: "var(--surface-container)", color: "var(--muted)" }
              }
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <button
          onClick={requestLocation}
          disabled={locating}
          aria-label="Use my location"
          className="stamp-interactive flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-container)] disabled:opacity-50"
          style={{ color: coords ? "var(--brand)" : "var(--muted)" }}
        >
          <MapPin className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[220px] w-full rounded-3xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--muted)]">No businesses match your search.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((b) => (
            <BusinessCard key={b.id} business={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BusinessCard({ business }: { business: DiscoverBusiness }) {
  const isNew = Date.now() - new Date(business.createdAt).getTime() < NEW_WINDOW_MS;
  const initial = business.name.charAt(0).toUpperCase();

  return (
    <Link
      to={`/${business.slug}/dashboard`}
      className="stamp-interactive shadow-ambient overflow-hidden rounded-3xl bg-[var(--surface)]"
    >
      <div
        className="flex h-32 items-end p-4"
        style={
          business.branding.bannerUrl
            ? {
                backgroundImage: `url(${business.branding.bannerUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {
                background: `linear-gradient(150deg, ${business.branding.primaryColor}, ${darken(business.branding.primaryColor)})`,
              }
        }
      >
        {business.branding.logoUrl ? (
          <img
            src={business.branding.logoUrl}
            alt=""
            className="h-11 w-11 rounded-2xl bg-white object-cover shadow-lg"
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white font-display text-lg font-bold shadow-lg"
            style={{ color: business.branding.primaryColor }}
          >
            {initial}
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="truncate font-display text-lg font-bold text-[var(--ink)]">{business.name}</h3>
        </div>
        <div className="mb-3 flex items-center gap-1.5 text-sm" style={{ color: business.branding.primaryColor }}>
          <Coins className="h-3.5 w-3.5" />
          {business.program.earnPercent === 100
            ? "1 point per Rs 1"
            : `${business.program.earnPercent}% back in points`}
        </div>
        <div className="flex items-center gap-1.5">
          {isNew && (
            <span className="rounded bg-[var(--surface-container-high)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
              New
            </span>
          )}
          <span className="rounded bg-[var(--surface-container-high)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
            {CATEGORY_LABELS[business.category]}
          </span>
        </div>
      </div>
    </Link>
  );
}
