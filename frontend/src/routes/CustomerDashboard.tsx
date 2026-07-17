import { Coins, MailWarning, MapPin, Phone as PhoneIcon, Mail, Clock, Instagram, Facebook, Twitter, Calendar, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useTenant } from "../context/TenantContext";
import { usePointsBalance, useRewardCatalog, formatPoints } from "../hooks/usePoints";
import { useCustomerMenu } from "../hooks/useCustomerMenu";
import { useAccount } from "../hooks/useAccount";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";
import { PointsBalanceCard } from "../components/customer/PointsBalanceCard";

function osmEmbedUrl(lat: number, lon: number): string {
  const delta = 0.01;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat},${lon}`;
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Rendered inside CustomerLayout (phone shell + bottom nav). Content only.
export default function CustomerDashboard() {
  const { data: account } = useAccount("customer");
  const unverified = account?.emailVerified === false;
  const { tenant, companySlug, outletSlug } = useTenant();
  const { data: points, isLoading: cardLoading } = usePointsBalance();
  const { data: catalog = [] } = useRewardCatalog();

  const balance = points?.balance ?? 0;
  const earnPercent = points?.earnPercent ?? tenant?.program?.earnPercent ?? 100;

  // What the balance can actually buy right now — far more motivating than a
  // bare number, and it's the outlet's own catalog, not an invented target.
  const affordable = catalog.filter((item) => item.pointsPrice <= balance);
  const nextUp = catalog
    .filter((item) => item.pointsPrice > balance)
    .sort((a, b) => a.pointsPrice - b.pointsPrice)[0];

  const contact = tenant?.contact;
  const hasLatLong = contact?.latitude != null && contact?.longitude != null;
  const hasContact = Boolean(
    contact &&
      (contact.phone ||
        contact.email ||
        contact.address ||
        contact.hours ||
        contact.aboutUs ||
        hasLatLong ||
        contact.socials.instagram ||
        contact.socials.facebook ||
        contact.socials.x)
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

  return (
    <div className="px-5 py-6">
      {/* Header — the shared top bar (wordmark/scan/notifications/avatar)
          lives in CustomerLayout; this is page content underneath it. */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold leading-tight text-[var(--ink)]">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-[var(--muted)]">{awayText}</p>
      </div>

      {/* Unverified-email prompt. Scanning is blocked by the backend (403)
          until the email is verified; this nudges the customer to do it. */}
      {unverified && (
        <div
          className="mb-4 flex items-start gap-3 rounded-[16px] border px-4 py-3"
          style={{ borderColor: "var(--warn-soft)", background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          <MailWarning className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-bold">Verify your email to start collecting points.</span>{" "}
            <button
              onClick={async () => {
                try {
                  await apiRequest("/api/auth/resend-verification", {
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

      <PointsBalanceCard
        balance={balance}
        earnPercent={earnPercent}
        expiresAt={points?.expiresAt ?? null}
        businessName={tenant?.name}
        isLoading={cardLoading}
      />

      {/* Away hint */}
      <div className="mb-2 flex items-center gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface-container)] px-4 py-3">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "var(--brand)" }}
        >
          <Coins className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-[var(--ink)]">{awayText}</span>
      </div>

      {catalog.length > 0 && (
        <div className="mt-4 shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
              Redeem your points
            </div>
            <Link to={tenantPath(companySlug, outletSlug, "history")} className="text-xs font-bold" style={{ color: "var(--brand)" }}>
              History
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {catalog.slice(0, 4).map((item) => {
              const canAfford = item.pointsPrice <= balance;
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: canAfford ? "var(--brand)" : "var(--surface-container)",
                      color: canAfford ? "#fff" : "var(--soft)",
                    }}
                  >
                    <Gift className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--ink)]">{item.name}</div>
                    {item.description && (
                      <div className="truncate text-[13px] text-[var(--muted)]">{item.description}</div>
                    )}
                  </div>
                  <span
                    className="flex-shrink-0 text-sm font-bold"
                    style={{ color: canAfford ? "var(--brand)" : "var(--soft)" }}
                  >
                    {formatPoints(item.pointsPrice)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[12px] text-[var(--muted)]">
            Ask the counter to bring up the redeem code, then scan it.
          </p>
        </div>
      )}

      {featuredItems.length > 0 && (
        <div className="mt-4 shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
            Featured picks
          </div>
          <div className="flex flex-col gap-2.5">
            {featuredItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--ink)]">{item.name}</div>
                  {item.description && (
                    <div className="truncate text-[13px] text-[var(--muted)]">{item.description}</div>
                  )}
                </div>
                {typeof item.price === "number" && (
                  <span className="text-sm font-bold text-[var(--ink)]">{item.price}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {upcomingEvents.length > 0 && (
        <div className="mt-4 shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
            Upcoming events
          </div>
          <div className="flex flex-col gap-3">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex gap-3">
                {event.imageUrl && (
                  <img src={event.imageUrl} alt="" className="h-14 w-14 flex-shrink-0 rounded-[12px] object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--brand)" }}>
                    <Calendar className="h-3.5 w-3.5" />
                    {formatEventDate(event.date)}
                    {event.time ? ` · ${event.time}` : ""}
                  </div>
                  <div className="truncate text-sm font-semibold text-[var(--ink)]">{event.title}</div>
                  {event.location && (
                    <div className="truncate text-[13px] text-[var(--muted)]">{event.location}</div>
                  )}
                  {event.description && (
                    <div className="truncate text-[13px] text-[var(--muted)]">{event.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasContact && contact && (
        <div className="mt-4 shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
            Visit us
          </div>

          {hasLatLong && (
            <iframe
              title="Location"
              src={osmEmbedUrl(contact.latitude as number, contact.longitude as number)}
              className="mb-3 h-[160px] w-full rounded-[14px] border-0"
            />
          )}

          {contact.address && (
            <div className="mb-2 flex items-start gap-2 text-sm text-[var(--ink)]">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              <a
                href={
                  hasLatLong
                    ? `https://www.openstreetmap.org/?mlat=${contact.latitude}&mlon=${contact.longitude}`
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
              >
                {contact.address}
              </a>
            </div>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="mb-2 flex items-center gap-2 text-sm text-[var(--ink)]">
              <PhoneIcon className="h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="mb-2 flex items-center gap-2 text-sm text-[var(--ink)]">
              <Mail className="h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              {contact.email}
            </a>
          )}
          {contact.hours && (
            <div className="mb-2 flex items-start gap-2 whitespace-pre-line text-sm text-[var(--ink)]">
              <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              {contact.hours}
            </div>
          )}
          {contact.aboutUs && (
            <p className="mb-3 text-sm text-[var(--muted)]">{contact.aboutUs}</p>
          )}

          {(contact.socials.instagram || contact.socials.facebook || contact.socials.x) && (
            <div className="flex gap-2">
              {contact.socials.instagram && (
                <a
                  href={contact.socials.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--brand)]"
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
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--brand)]"
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
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--brand)]"
                  aria-label="X (Twitter)"
                >
                  <Twitter className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        {unverified
          ? "Verify your email above before you can scan to earn points."
          : "Tap the scan button below and point at the counter’s QR to earn points."}
      </p>
    </div>
  );
}
