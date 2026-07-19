import { Link } from "react-router-dom";
import { Store } from "lucide-react";

import { useMyTenants, type MyTenantMembership } from "../hooks/useMyTenants";
import { formatPoints } from "../hooks/usePoints";
import { tenantPath } from "../lib/tenantPath";
import { darken } from "../lib/color";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function ExploreMine() {
  const { data: memberships = [], isLoading } = useMyTenants();

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-[var(--ink)]">My businesses</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          Every business you've earned points at.
        </p>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] w-full rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : memberships.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-12 text-center shadow-ambient">
          <Store className="mx-auto h-7 w-7 text-[var(--soft)]" strokeWidth={1.5} />
          <p className="mb-5 mt-3 text-sm text-[var(--muted)]">
            You haven't joined a business yet. Find one to start earning points.
          </p>
          <Button asChild size="lg">
            <Link to="/explore">Explore businesses</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
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
      className="stamp-interactive flex flex-col rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-ambient"
    >
      <div className="mb-4 flex items-center gap-3">
        {/* The logo tile is the outlet's identity and keeps its true colour. */}
        {m.branding.logoUrl ? (
          <img
            src={m.branding.logoUrl}
            alt=""
            className="h-11 w-11 flex-shrink-0 rounded-[var(--radius-field)] object-cover"
          />
        ) : (
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-field)] font-display text-lg font-bold text-white"
            style={{
              background: `linear-gradient(150deg, ${m.branding.primaryColor}, ${darken(m.branding.primaryColor)})`,
            }}
          >
            {m.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-bold text-[var(--ink)]">
            {m.name}
          </div>
          <div className="text-xs text-[var(--muted)]">{lastVisit(m.lastActivityAt)}</div>
        </div>
      </div>

      {/* No progress bar: a points balance has no target to fill toward, and
          inventing one would be inventing a number the outlet never set.

          The figure is green, not the outlet's colour. It used to be painted
          with branding.primaryColor raw — an unchecked tenant hue on the one
          number the customer is here to read. */}
      <div className="mt-auto flex items-baseline gap-1.5">
        <span className="font-numeral text-[34px] leading-none text-[var(--primary)]">
          {formatPoints(m.balance)}
        </span>
        {/* Points never pool across outlets — earned at one counter, spent at
            that same counter. Saying so here stops a customer expecting a
            balance to follow them to a sibling branch. */}
        <span className="text-xs text-[var(--soft)]">points · here only</span>
      </div>
    </Link>
  );
}
