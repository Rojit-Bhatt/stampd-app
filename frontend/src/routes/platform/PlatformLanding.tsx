import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  Instagram,
  Facebook,
  Twitter,
  User,
  Store,
  QrCode,
  Wallet,
  BarChart3,
  Palette,
} from "lucide-react";
import { PLATFORM_NAME } from "../../lib/platform";
import { usePlatformContact } from "../../hooks/usePlatformContact";

const STEPS = [
  { n: "1", t: "We set up your card", d: "Pick your reward and how many stamps it takes. Live in minutes — no app store needed." },
  { n: "2", t: "Customers scan to collect", d: "They scan a code at your counter. Each visit adds a stamp to their digital card." },
  { n: "3", t: "They earn, you keep them", d: "A full card becomes a free-reward voucher — and a reason to come back." },
];
const CUSTOMER_FEATURES = [
  { Icon: Wallet, t: "Digital wallet", d: "Every stamp card lives in your phone's browser — one home for every business you're loyal to, nothing to print or lose." },
  { Icon: QrCode, t: "Instant QR stamps", d: "Scan the counter code with your phone's own camera, or the in-app scanner, and your stamp lands immediately." },
];
const BUSINESS_FEATURES = [
  { Icon: BarChart3, t: "Powerful insights", d: "Track stamps, redemptions, and repeat visits from one dashboard, with exportable reports." },
  { Icon: Palette, t: "Bespoke branding", d: "Your logo, your colour, your reward — customers feel like it's your own app, not a shared platform." },
];
const FAQS = [
  { q: "Do my customers need to download an app?", a: "No. It runs in the browser and can be added to their home screen like an app." },
  { q: "Can I choose my own reward?", a: "Yes — set any reward and any number of stamps." },
  { q: "How do stamps get added?", a: "You show a short-lived QR code at the counter; the customer scans it to earn one stamp." },
  { q: "Is there a cart or payments?", a: `No. ${PLATFORM_NAME} is purely loyalty — collect stamps, complete a card, earn a free reward.` },
];

export default function PlatformLanding() {
  useEffect(() => {
    document.title = `${PLATFORM_NAME} — digital loyalty for local business`;
  }, []);

  const { data: contact } = usePlatformContact();
  const hasContact = Boolean(
    contact &&
      (contact.phone ||
        contact.email ||
        contact.address ||
        contact.hours ||
        contact.aboutUs ||
        contact.socials.instagram ||
        contact.socials.facebook ||
        contact.socials.x)
  );
  const hasSocials = Boolean(
    contact && (contact.socials.instagram || contact.socials.facebook || contact.socials.x)
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1140px] items-center gap-8 px-6 py-4">
          <span className="font-display text-xl font-bold tracking-tight" style={{ color: "var(--plat)" }}>
            {PLATFORM_NAME}
          </span>
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--plat)]">
              Features
            </a>
            <a href="#business" className="text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--plat)]">
              For Business
            </a>
            <a href="#customers" className="text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--plat)]">
              For Customers
            </a>
          </nav>
          <Link
            to="/platform/login"
            className="ml-auto rounded-lg border px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--plat)", color: "var(--plat)" }}
          >
            Log In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1140px] items-center gap-12 px-6 py-16 md:grid-cols-[1.05fr_.95fr]">
        <div>
          <span
            className="mb-5 inline-block rounded-full px-3.5 py-1.5 text-[13px] font-bold uppercase tracking-wider"
            style={{ background: "var(--plat-soft)", color: "var(--plat)" }}
          >
            Rewarding every visit
          </span>
          <h1 className="font-display text-[44px] leading-[1.1] tracking-tight md:text-[52px]">
            The modern soul of{" "}
            <span className="italic" style={{ color: "var(--plat)" }}>
              loyalty.
            </span>
          </h1>
          <p className="mb-7 mt-4 max-w-[480px] text-[18px] text-[var(--muted)]">
            Reimagining the paper stamp card for the digital age — a beautiful, seamless bridge
            between local businesses and the customers who keep coming back.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/customer-login"
              className="stamp-interactive group relative flex-1 overflow-hidden rounded-xl px-6 py-5 text-white"
              style={{ background: "var(--plat)" }}
            >
              <User className="mb-2 h-6 w-6" />
              <div className="font-display text-lg font-bold">Customer Login</div>
              <div className="text-[13px] opacity-80">Track your rewards &amp; stamps</div>
            </Link>
            <Link
              to="/business-login"
              className="stamp-interactive group relative flex-1 overflow-hidden rounded-xl bg-[var(--surface-container)] px-6 py-5"
            >
              <Store className="mb-2 h-6 w-6" style={{ color: "var(--plat)" }} />
              <div className="font-display text-lg font-bold">Business Admin</div>
              <div className="text-[13px] text-[var(--muted)]">Manage cards &amp; analytics</div>
            </Link>
          </div>
        </div>

        {/* Bento visual */}
        <div className="grid grid-cols-2 gap-4">
          <div className="shadow-ambient col-span-1 row-span-2 flex flex-col justify-end rounded-3xl bg-[var(--surface)] p-6">
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "var(--plat-soft)" }}
            >
              <QrCode className="h-5 w-5" style={{ color: "var(--plat)" }} />
            </div>
            <h3 className="font-display text-lg font-bold">Seamless scan</h3>
            <p className="text-sm text-[var(--muted)]">Instant stamps via QR at the counter — no app to install.</p>
          </div>

          <div
            className="rounded-3xl p-6 text-white shadow-2xl"
            style={{ background: "linear-gradient(155deg, var(--brand), var(--brand-deep))" }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="truncate text-xs uppercase tracking-wider opacity-80">Coffesarowar</span>
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] bg-white/20 text-xs font-bold">
                C
              </span>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: i < 2 ? "#fff" : "rgba(255,255,255,.15)",
                    border: `2px dashed ${i < 2 ? "#fff" : "rgba(255,255,255,.4)"}`,
                    color: "var(--brand)",
                  }}
                >
                  {i < 2 ? "★" : ""}
                </div>
              ))}
            </div>
          </div>

          <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
            <div className="font-display text-lg font-bold">Live in minutes</div>
            <p className="text-sm text-[var(--muted)]">No hardware, no app store review — set your program and go.</p>
          </div>
        </div>
      </section>

      {/* For Customers / For Business */}
      <section className="bg-[var(--surface-container-low,var(--surface))] px-6 py-16" id="features">
        <div className="mx-auto flex max-w-[1140px] flex-col gap-10 md:flex-row">
          <div className="flex-1" id="customers">
            <h2 className="mb-5 font-display text-2xl font-bold" style={{ color: "var(--plat)" }}>
              For Customers
            </h2>
            <div className="flex flex-col gap-3">
              {CUSTOMER_FEATURES.map((f) => (
                <div key={f.t} className="shadow-ambient flex items-start gap-4 rounded-2xl bg-[var(--surface)] p-5">
                  <f.Icon className="mt-0.5 h-6 w-6 flex-shrink-0" style={{ color: "var(--plat)" }} />
                  <div>
                    <h4 className="font-bold text-[var(--ink)]">{f.t}</h4>
                    <p className="text-sm text-[var(--muted)]">{f.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1" id="business">
            <h2 className="mb-5 font-display text-2xl font-bold" style={{ color: "var(--plat)" }}>
              For Business
            </h2>
            <div className="flex flex-col gap-3">
              {BUSINESS_FEATURES.map((f) => (
                <div key={f.t} className="shadow-ambient flex items-start gap-4 rounded-2xl bg-[var(--surface)] p-5">
                  <f.Icon className="mt-0.5 h-6 w-6 flex-shrink-0" style={{ color: "var(--plat)" }} />
                  <div>
                    <h4 className="font-bold text-[var(--ink)]">{f.t}</h4>
                    <p className="text-sm text-[var(--muted)]">{f.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1140px] px-6 py-10">
        <h2 className="mb-8 text-center text-[15px] font-extrabold uppercase tracking-[0.1em] text-[var(--soft)]">
          How it works
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-7">
              <div
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] font-display text-lg font-extrabold"
                style={{ background: "var(--plat-soft)", color: "var(--plat)" }}
              >
                {s.n}
              </div>
              <h3 className="mb-1.5 font-display text-[19px] font-bold">{s.t}</h3>
              <p className="text-sm text-[var(--muted)]">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mission banner */}
      <section className="mx-auto max-w-[1140px] px-6 py-10">
        <div
          className="rounded-3xl p-11 text-white"
          style={{ background: "linear-gradient(135deg, var(--brand-deep), var(--plat))" }}
        >
          <h2 className="mb-4 max-w-2xl font-display text-3xl font-bold">
            A loyalty card that feels like your business, not a shared app.
          </h2>
          <p className="max-w-2xl text-[17px] italic opacity-90">
            No punch cards to reprint, no third-party logo cluttering the experience — just your
            name, your colour, and your reward, at every single visit.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[760px] px-6 py-10">
        <h2 className="mb-6 text-center font-display text-[30px] font-extrabold">Questions, answered</h2>
        <div className="flex flex-col gap-2.5">
          {FAQS.map((f) => (
            <div key={f.q} className="shadow-ambient rounded-3xl bg-[var(--surface)] p-5">
              <div className="mb-1 text-[15px] font-bold">{f.q}</div>
              <div className="text-sm text-[var(--muted)]">{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      {hasContact && contact && (
        <section className="mx-auto max-w-[760px] px-6 py-10" id="contact">
          <h2 className="mb-6 text-center font-display text-[30px] font-extrabold">Contact us</h2>
          <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
            {contact.address && (
              <div className="mb-2 flex items-start gap-2 text-sm text-[var(--ink)]">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
                {contact.address}
              </div>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="mb-2 flex items-center gap-2 text-sm text-[var(--ink)]">
                <Phone className="h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
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
            {contact.aboutUs && <p className="mb-3 text-sm text-[var(--muted)]">{contact.aboutUs}</p>}
            {hasSocials && (
              <div className="flex gap-2">
                {contact.socials.instagram && (
                  <a
                    href={contact.socials.instagram}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--plat)]"
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
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--plat)]"
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
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--plat)]"
                    aria-label="X (Twitter)"
                  >
                    <Twitter className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-6 bg-[var(--surface-container-high,var(--surface))] px-6 pb-8 pt-14">
        <div className="mx-auto max-w-[1140px]">
          <div className="mb-10 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <div className="mb-3 font-display text-xl font-bold" style={{ color: "var(--plat)" }}>
                {PLATFORM_NAME}
              </div>
              <p className="max-w-xs text-sm text-[var(--muted)]">
                Elevating the connection between merchants and the people who love them.
              </p>
            </div>
            <div>
              <h5 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--ink)]">Explore</h5>
              <ul className="flex flex-col gap-2 text-sm text-[var(--muted)]">
                <li>
                  <Link to="/customer-login" className="hover:text-[var(--plat)]">
                    Customer app
                  </Link>
                </li>
                <li>
                  <Link to="/business-login" className="hover:text-[var(--plat)]">
                    Business console
                  </Link>
                </li>
                <li>
                  <Link to="/platform/login" className="hover:text-[var(--plat)]">
                    Platform admin
                  </Link>
                </li>
              </ul>
            </div>
            {hasContact && (
              <div>
                <h5 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--ink)]">Company</h5>
                <ul className="flex flex-col gap-2 text-sm text-[var(--muted)]">
                  <li>
                    <a href="#contact" className="hover:text-[var(--plat)]">
                      Contact
                    </a>
                  </li>
                </ul>
              </div>
            )}
            {hasSocials && contact && (
              <div>
                <h5 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--ink)]">Connect</h5>
                <div className="flex gap-3">
                  {contact.socials.instagram && (
                    <a
                      href={contact.socials.instagram}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--muted)] hover:text-[var(--plat)]"
                      aria-label="Instagram"
                    >
                      <Instagram className="h-5 w-5" />
                    </a>
                  )}
                  {contact.socials.facebook && (
                    <a
                      href={contact.socials.facebook}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--muted)] hover:text-[var(--plat)]"
                      aria-label="Facebook"
                    >
                      <Facebook className="h-5 w-5" />
                    </a>
                  )}
                  {contact.socials.x && (
                    <a
                      href={contact.socials.x}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--muted)] hover:text-[var(--plat)]"
                      aria-label="X (Twitter)"
                    >
                      <Twitter className="h-5 w-5" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--line)] pt-6 text-sm text-[var(--muted)] md:flex-row">
            <p className="text-[13px] opacity-70">© 2026 {PLATFORM_NAME}. All rights reserved.</p>
            <Link
              to="/platform/login"
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--soft)] hover:text-[var(--plat)]"
            >
              Platform admin login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
