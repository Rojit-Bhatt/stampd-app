import { Link } from "react-router-dom";
import { useMyTenants, type MyTenantMembership } from "../hooks/useMyTenants";
import { formatPoints } from "../hooks/usePoints";
import { tenantPath } from "../lib/tenantPath";
import { darken } from "../lib/color";
import { Skeleton } from "../components/ui/skeleton";

export default function ExploreMine() {
  const { data: memberships = [], isLoading } = useMyTenants();

  return (
    <div className="px-5 py-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-[var(--ink)]">My Businesses</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Every business you've earned points at.
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] w-full rounded-3xl" />
          ))}
        </div>
      ) : memberships.length === 0 ? (
        <div className="py-14 text-center">
          <p className="mb-4 text-sm text-[var(--muted)]">
            You haven't joined a business yet. Find one to start earning points.
          </p>
          <Link
            to="/explore"
            className="stamp-interactive inline-block rounded-full px-6 py-3 text-sm font-bold text-white"
            style={{ background: "var(--brand)" }}
          >
            Explore businesses
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {memberships.map((m) => (
            <MembershipCard key={m.organizationId} membership={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function lastVisit(iso: string | null): string {
  if (!iso) return "No visits yet";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Last visit today";
  if (days === 1) return "Last visit yesterday";
  return `Last visit ${days} days ago`;
}

function MembershipCard({ membership: m }: { membership: MyTenantMembership }) {
  return (
    <Link
      to={tenantPath(m.companySlug, m.slug, "dashboard")}
      className="stamp-interactive shadow-ambient rounded-3xl bg-[var(--surface)] p-5"
    >
      <div className="mb-3 flex items-center gap-3">
        {m.branding.logoUrl ? (
          <img src={m.branding.logoUrl} alt="" className="h-11 w-11 rounded-2xl object-cover" />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl font-display text-lg font-bold text-white"
            style={{ background: `linear-gradient(150deg, ${m.branding.primaryColor}, ${darken(m.branding.primaryColor)})` }}
          >
            {m.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-bold text-[var(--ink)]">{m.name}</div>
          <div className="text-xs text-[var(--muted)]">{lastVisit(m.lastActivityAt)}</div>
        </div>
      </div>
      {/* No progress bar: a points balance has no target to fill toward, and
          inventing one would be inventing a number the outlet never set. */}
      <div className="flex items-end justify-between">
        <div>
          <div className="font-display text-3xl font-extrabold leading-none" style={{ color: m.branding.primaryColor }}>
            {formatPoints(m.balance)}
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">points</div>
        </div>
        <span className="rounded-full bg-[var(--surface-container)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {m.earnPercent === 100 ? "1 pt / Rs 1" : `${m.earnPercent}% back`}
        </span>
      </div>
    </Link>
  );
}
