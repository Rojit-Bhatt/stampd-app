import { Coffee, MailWarning, MapPin, Phone as PhoneIcon, Mail, Clock, Instagram, Facebook, Twitter, Calendar } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import toast from "react-hot-toast";
import { useTenant } from "../context/TenantContext";
import { useStampCard } from "../hooks/useStampCard";
import { useCustomerMenu } from "../hooks/useCustomerMenu";
import { useAccount } from "../hooks/useAccount";
import { apiRequest } from "../lib/api";
import { PunchCard } from "../components/customer/PunchCard";

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
  const reduceMotion = useReducedMotion();
  const { data: account } = useAccount("customer");
  const unverified = account?.emailVerified === false;
  const { tenant } = useTenant();
  const { data: stampData, isLoading: cardLoading } = useStampCard();

  const program = tenant?.program;
  const required = stampData?.stampsRequired ?? program?.stampsRequired ?? 5;
  const reward = stampData?.rewardTitle ?? program?.rewardTitle ?? "Reward";
  const stampsEarned = stampData?.stampsEarned ?? 0;
  const remaining = Math.max(0, required - stampsEarned);
  const initial = (tenant?.name || "?").charAt(0).toUpperCase();

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

  const awayText =
    remaining > 0
      ? `You're ${remaining} stamp${remaining > 1 ? "s" : ""} from a ${reward}`
      : "Card complete — your reward is ready!";

  return (
    <div className="px-5 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-[13px] font-display text-[17px] font-extrabold text-white"
          style={{ background: "var(--brand)" }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--muted)]">Welcome back ☕</div>
          <div className="truncate font-display text-lg font-bold leading-tight text-[var(--ink)]">
            {tenant?.name}
          </div>
        </div>
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
            <span className="font-bold">Verify your email to start collecting stamps.</span>{" "}
            <button
              onClick={async () => {
                try {
                  await apiRequest("/api/auth/resend-verification", {
                    method: "POST",
                    body: { email: account?.email },
                  });
                  toast.success("Verification email resent.");
                } catch {
                  toast.error("Could not resend. Try again.");
                }
              }}
              className="font-bold underline"
            >
              Resend
            </button>
          </div>
        </div>
      )}

      {/* Reward card — enters like it's being placed down on the counter,
          the moment a customer sees right after signing in. */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 28, rotate: -4, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 20 }}
        className="shadow-ambient mb-4 rounded-3xl bg-[var(--surface)] p-6"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold" style={{ color: "var(--brand)" }}>
              {tenant?.name}
            </div>
            <div className="truncate text-sm text-[var(--muted)]">{reward}</div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="font-display text-2xl font-bold leading-none" style={{ color: "var(--brand)" }}>
              {cardLoading ? (
                <span className="inline-block h-6 w-14 animate-pulse rounded bg-[var(--line)] align-middle" />
              ) : (
                `${stampsEarned}/${required}`
              )}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--soft)]">stamps</div>
          </div>
        </div>
        <PunchCard stampsEarned={stampsEarned} stampsRequired={required} />
      </motion.div>

      {/* Away hint */}
      <div className="mb-2 flex items-center gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface-container)] px-4 py-3">
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "var(--brand)" }}
        >
          <Coffee className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-[var(--ink)]">{awayText}</span>
      </div>

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
                {item.price && <span className="text-sm font-bold text-[var(--ink)]">{item.price}</span>}
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
          ? "Verify your email above before you can scan to earn stamps."
          : "Tap the scan button below and point at the barista’s QR to earn a stamp."}
      </p>
    </div>
  );
}
