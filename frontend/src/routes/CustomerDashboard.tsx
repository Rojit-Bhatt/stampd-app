import type { ReactNode } from "react";
import {
  MailWarning,
  MapPin,
  Phone as PhoneIcon,
  Mail,
  Clock,
  Instagram,
  Facebook,
  Twitter,
  Calendar,
  Gift,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import { useTenant } from "../context/TenantContext";
import { usePointsBalance, useRewardCatalog, usePublicCampaigns, formatPoints } from "../hooks/usePoints";
import { useCustomerMenu } from "../hooks/useCustomerMenu";
import { useAccount } from "../hooks/useAccount";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";
import { PointsBalanceCard } from "../components/customer/PointsBalanceCard";
import { Badge } from "@/components/ui/badge";

function TiktokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.59 4.23.95.1 1.9.1 2.85.1v3.91c-.95 0-1.9 0-2.85-.1-.28.87-.85 1.62-1.59 2.16v4.61c.05 1.34-.33 2.68-1.08 3.79-.75 1.11-1.85 1.9-3.13 2.23-1.28.33-2.63.14-3.79-.53-1.16-.67-1.98-1.78-2.31-3.13-.33-1.28-.14-2.63.53-3.79.67-1.16 1.78-1.98 3.13-2.31V14.1c-.67.11-1.32.37-1.89.77-.57.4-1.01.94-1.29 1.58-.28.64-.37 1.35-.26 2.05.11.7.42 1.35.89 1.88.47.53 1.09.9 1.79 1.07.7.17 1.43.14 2.12-.09.69-.23 1.29-.65 1.73-1.22.44-.57.69-1.27.72-1.99V4.65c-.11-1.54.51-3.07 1.67-4.1.95-.8 2.16-1.23 3.4-1.23-.08.24-.08.49-.08.73z" />
    </svg>
  );
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Falls back to the schedule when a campaign has no description of its own.
function campaignWhen(c: { startAt: string; daysOfWeek: number[] }): string {
  const from = new Date(c.startAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (c.daysOfWeek.length === 0 || c.daysOfWeek.length === 7) return `From ${from}`;
  const days = c.daysOfWeek.slice().sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(", ");
  return `${days} · from ${from}`;
}

/** One card on the dashboard. Every block below is the same shape. */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-ambient">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Rendered inside CustomerLayout (shell + bottom nav). Content only.
export default function CustomerDashboard() {
  const { data: account } = useAccount("customer");
  const unverified = account?.emailVerified === false;
  const { tenant, companySlug, outletSlug } = useTenant();
  const { data: points, isLoading: cardLoading } = usePointsBalance();
  const { data: catalog = [] } = useRewardCatalog();
  const { data: campaigns = [] } = usePublicCampaigns();

  const balance = points?.balance ?? 0;

  // What the balance can actually buy right now — far more motivating than a
  // bare number, and it's the outlet's own catalog, not an invented target.
  const affordable = catalog.filter((item) => item.pointsPrice <= balance);
  const nextUp = catalog
    .filter((item) => item.pointsPrice > balance)
    .sort((a, b) => a.pointsPrice - b.pointsPrice)[0];

  const contact = tenant?.contact;
  const hasContact = Boolean(
    contact &&
      (contact.phone ||
        contact.email ||
        contact.address ||
        contact.hours ||
        contact.aboutUs ||
        contact.socials.instagram ||
        contact.socials.facebook ||
        contact.socials.x ||
        contact.socials.tiktok)
  );

  const { data: menuData } = useCustomerMenu();
  const menuEnabled = menuData?.menuEnabled ?? false;
  const featuredItems = menuEnabled ? (menuData?.items ?? []).filter((i) => i.isFeatured).slice(0, 3) : [];

  const upcomingEvents = tenant?.upcomingEvents ?? [];

  const awayText = cardLoading
    ? "Loading your points…"
    : affordable.length > 0
      ? `You can redeem ${affordable.length} reward${affordable.length === 1 ? "" : "s"} right now`
      : nextUp
        ? `${formatPoints(nextUp.pointsPrice - balance)} more points for a ${nextUp.name}`
        : "Every rupee you spend earns points here";

  const firstName = (account?.name || "").split(" ")[0];

  // The live one already has its own banner above — this is what's next.
  const upcomingCampaigns = campaigns.filter((c) => !c.isLive).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6">
      {/* The shared top bar lives in CustomerLayout; this is content beneath. */}
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold leading-tight text-[var(--ink)]">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h1>
        {/* Said once, here. It used to also repeat verbatim in a card below. */}
        <p className="mt-0.5 text-sm text-[var(--muted)]">{awayText}</p>
      </header>

      {/* Earning is open to an unverified customer — only redeeming is gated
          (see pointsService.redeemPoints). So this is a heads-up, not a
          blocker, and it says exactly which of the two is affected. Telling
          someone their points aren't collecting when they are would be a
          lie that costs the outlet a visit. */}
      {unverified && (
        <div
          className="mb-4 flex items-start gap-3 rounded-[var(--radius-btn)] px-4 py-3"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          <MailWarning className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-bold">
              You're collecting points fine — verify your email before you spend them.
            </span>{" "}
            <button
              onClick={async () => {
                try {
                  // The GLOBAL endpoint, not the tenant-scoped /api/auth one:
                  // only this path flips CustomerAccount.emailVerified and
                  // fans it out to every outlet membership. The tenant link
                  // would verify this outlet's row alone.
                  await apiRequest("/api/customer-auth/resend-verification", {
                    method: "POST",
                    body: { email: account?.email },
                  });
                  toast.success("Verification email sent — check your inbox.");
                } catch {
                  toast.error("Couldn't resend that — try again in a bit.");
                }
              }}
              className="font-bold underline"
            >
              Resend
            </button>
          </div>
        </div>
      )}

      {/* Two columns from lg: the balance and what it buys stay together on
          the left, everything about the place itself moves right. On a phone
          it's one column in exactly this order. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          {/* Above the balance on purpose: a live multiplier is the most
              time-sensitive thing on this page — it's the reason to come in
              today rather than tomorrow. Green, because it's about value. */}
          {points?.activeCampaign && (
            <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-[var(--primary)] px-4 py-3.5 text-white">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                <Zap className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">
                  {formatPoints(points.activeCampaign.multiplier)}× points on right now
                </div>
                <div className="truncate text-[13px] opacity-85">
                  {points.activeCampaign.name}
                </div>
              </div>
            </div>
          )}

          <PointsBalanceCard
            balance={balance}
            expiresAt={points?.expiresAt ?? null}
            businessName={tenant?.name}
            isLoading={cardLoading}
          />

          {catalog.length > 0 && (
            <Section
              title="Redeem your points"
              action={
                <Link
                  to={tenantPath(companySlug, outletSlug, "history")}
                  className="text-xs font-bold text-[var(--primary-deep)] hover:underline"
                >
                  History
                </Link>
              }
            >
              <ul className="flex flex-col gap-3">
                {catalog.slice(0, 4).map((item) => {
                  const canAfford = item.pointsPrice <= balance;
                  return (
                    <li key={item.id} className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: canAfford ? "var(--primary-soft)" : "var(--surface-2)",
                          color: canAfford ? "var(--primary-deep)" : "var(--soft)",
                        }}
                      >
                        <Gift className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--ink)]">
                          {item.name}
                        </div>
                        {item.description && (
                          <div className="truncate text-[13px] text-[var(--muted)]">
                            {item.description}
                          </div>
                        )}
                      </div>
                      <span
                        className="flex-shrink-0 font-numeral text-xl leading-none"
                        style={{ color: canAfford ? "var(--primary)" : "var(--soft)" }}
                      >
                        {formatPoints(item.pointsPrice)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3.5 text-xs text-[var(--muted)]">
                Ask the counter to bring up the redeem code, then scan it.
              </p>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {upcomingCampaigns.length > 0 && (
            <Section title="Coming up">
              <ul className="flex flex-col gap-3">
                {upcomingCampaigns.map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <Badge variant="active" className="flex-shrink-0 font-numeral text-sm">
                      {formatPoints(c.multiplier)}×
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--ink)]">
                        {c.name}
                      </div>
                      <div className="truncate text-[13px] text-[var(--muted)]">
                        {c.description || campaignWhen(c)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {featuredItems.length > 0 && (
            <Section title="Featured picks">
              <ul className="flex flex-col gap-3">
                {featuredItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[var(--ink)]">
                        {item.name}
                      </div>
                      {item.description && (
                        <div className="truncate text-[13px] text-[var(--muted)]">
                          {item.description}
                        </div>
                      )}
                    </div>
                    {typeof item.price === "number" && (
                      <span className="flex-shrink-0 text-sm font-bold text-[var(--ink)]">
                        Rs {item.price}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {upcomingEvents.length > 0 && (
            <Section title="Upcoming events">
              <ul className="flex flex-col gap-3.5">
                {upcomingEvents.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    {event.imageUrl && (
                      <img
                        src={event.imageUrl}
                        alt=""
                        className="h-14 w-14 flex-shrink-0 rounded-[var(--radius-field)] object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className="flex items-center gap-1.5 text-[11px] font-bold"
                        style={{ color: "var(--brand-ink)" }}
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        {formatEventDate(event.date)}
                        {event.time ? ` · ${event.time}` : ""}
                      </div>
                      <div className="truncate text-sm font-semibold text-[var(--ink)]">
                        {event.title}
                      </div>
                      {event.location && (
                        <div className="truncate text-[13px] text-[var(--muted)]">
                          {event.location}
                        </div>
                      )}
                      {event.description && (
                        <div className="truncate text-[13px] text-[var(--muted)]">
                          {event.description}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {hasContact && contact && (
            <Section title="Visit us">
              {contact.address && (
                <iframe
                  title="Location"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(contact.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                  className="mb-3.5 h-[160px] w-full rounded-[var(--radius-btn)] border-0"
                />
              )}

              <div className="flex flex-col gap-2.5">
                {contact.address && (
                  <div className="flex items-start gap-2.5 text-sm text-[var(--ink)]">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
                    <a
                      href={
                        contact.address.startsWith("http")
                          ? contact.address
                          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline text-left"
                    >
                      {contact.address}
                    </a>
                  </div>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-2.5 text-sm text-[var(--ink)] hover:underline"
                  >
                    <PhoneIcon className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
                    {contact.phone}
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center gap-2.5 text-sm text-[var(--ink)] hover:underline"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
                    {contact.email}
                  </a>
                )}
                {contact.hours && (
                  <div className="flex items-start gap-2.5 whitespace-pre-line text-sm text-[var(--ink)]">
                    <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
                    {contact.hours}
                  </div>
                )}
              </div>

              {contact.aboutUs && (
                <p className="mt-3 text-sm text-[var(--muted)] text-left">{contact.aboutUs}</p>
              )}

              {(contact.socials.instagram || contact.socials.facebook || contact.socials.x || contact.socials.tiktok) && (
                <div className="mt-3.5 flex gap-2">
                  {contact.socials.instagram && (
                    <a
                      href={contact.socials.instagram}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:text-[var(--brand-ink)]"
                      aria-label="Instagram"
                    >
                      <Instagram className="h-4 w-4" />
                    </a>
                  )}
                  {contact.socials.facebook && (
                    <a
                      href={contact.socials.facebook}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:text-[var(--brand-ink)]"
                      aria-label="Facebook"
                    >
                      <Facebook className="h-4 w-4" />
                    </a>
                  )}
                  {contact.socials.x && (
                    <a
                      href={contact.socials.x}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:text-[var(--brand-ink)]"
                      aria-label="X (Twitter)"
                    >
                      <Twitter className="h-4 w-4" />
                    </a>
                  )}
                  {contact.socials.tiktok && (
                    <a
                      href={contact.socials.tiktok}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] transition-colors hover:text-[var(--brand-ink)]"
                      aria-label="TikTok"
                    >
                      <TiktokIcon className="h-4 w-4" />
                    </a>
                  )}
                </div>
              )}
            </Section>
          )}
        </div>
      </div>

      {/* Deliberately doesn't say "below": the scan button sits in the bottom
          pill on a phone and in the header on desktop. */}
      <p className="mt-5 text-center text-xs text-[var(--muted)]">
        Tap Scan and point at the counter's QR to earn points.
      </p>
    </div>
  );
}
