import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Lock,
  Zap,
  Palette,
  BookOpen,
  Building2,
  ShieldCheck,
  Plus,
  Minus,
  Gift,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";

import { PLATFORM_NAME } from "../../lib/platform";
import { StampdLogo } from "../../components/shared/StampdLogo";
import { usePlatformContact } from "../../hooks/usePlatformContact";
import { Button } from "@/components/ui/button";

// The marketing site. Rebuilt around the actual loop rather than generic SaaS
// claims: what this product does is specific and slightly unusual — a QR that
// opens in the phone's own camera, points as a share of the bill, balances
// that deliberately don't pool between branches — and saying that plainly
// persuades better than adjectives.
//
// Every figure on this page is a fact about how the product works. There are
// no invented customer counts, testimonials or logos.

const LOOP = [
  {
    n: "1",
    title: "Enter the bill",
    body: "Staff types what the customer paid. Points are a share of it — you set the percent.",
  },
  {
    n: "2",
    title: "Customer scans",
    body: "Their own phone camera opens the claim page. No app, no account hunting.",
  },
  {
    n: "3",
    title: "Points land",
    body: "Instantly, with a little celebration. Fractional too, so a Rs 105 bill at 10% is 10.5.",
  },
  {
    n: "4",
    title: "They spend it here",
    body: "On rewards you choose — and a real reason to walk back through your door.",
  },
];

const FEATURES = [
  {
    Icon: Gift,
    title: "Points as a share of the bill",
    body: "Set 5%, 10%, whatever fits your margins. Sensible defaults, overridable per outlet.",
  },
  {
    Icon: Zap,
    title: "Double-point campaigns",
    body: "Run a 2× weekend or a quiet-Tuesday boost. Pick the days; it goes live on its own, in Nepal time.",
  },
  {
    Icon: Palette,
    title: "Your brand, not ours",
    body: "Your logo and colour theme the customer experience. It feels like your place, not a shared app.",
  },
  {
    Icon: BookOpen,
    title: "A ledger you can trust",
    body: "Every earn and spend is a row that never changes. Balances always equal the history. Export any range.",
  },
  {
    Icon: Building2,
    title: "One chain, many outlets",
    body: "Run several branches from one login, each isolated, with a private group rollup no single outlet can see.",
  },
  {
    Icon: ShieldCheck,
    title: "Staff-safe by design",
    body: "Earn codes are single-use and short-lived. A customer can never move their own balance.",
  },
];

const FAQ = [
  {
    q: "Do my customers need to download an app?",
    a: "No. They scan with their phone's own camera and it opens in the browser. They can add it to their home screen if they want to, and then it behaves like an app.",
  },
  {
    q: "Can I choose my own rewards?",
    a: "Yes. Put a points price on any menu item, or create a standalone reward that isn't on the menu at all. You also set how much of a bill comes back as points.",
  },
  {
    q: "Do points work across my branches?",
    a: "Points are earned and spent at the same counter, on purpose — each outlet keeps its own balances, even between two branches of one chain. You still get a private rollup across all of them.",
  },
  {
    q: "Is there a payment gateway?",
    a: "No. Stampd is purely loyalty — we never touch your customers' money. Your own subscription is arranged with us directly and activated with a key.",
  },
];

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--line)]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-display text-base font-bold text-[var(--ink)]">{q}</span>
        {open ? (
          <Minus className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
        ) : (
          <Plus className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
        )}
      </button>
      {open && <p className="-mt-1 pb-5 text-sm leading-relaxed text-[var(--muted)]">{a}</p>}
    </div>
  );
}

export default function PlatformLanding() {
  const { data: contact } = usePlatformContact();
  const hasContact = Boolean(contact && (contact.phone || contact.email || contact.address));

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <StampdLogo size={26} />
            <span className="font-display text-lg font-bold">{PLATFORM_NAME}</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-6 text-sm font-semibold text-[var(--muted)] lg:flex">
            <a href="#loop" className="hover:text-[var(--ink)]">How it works</a>
            <a href="#features" className="hover:text-[var(--ink)]">For businesses</a>
            <a href="#nepal" className="hover:text-[var(--ink)]">Made for Nepal</a>
            <a href="#faq" className="hover:text-[var(--ink)]">Questions</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin-login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/explore">Start collecting</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO — leads with the sentence that actually describes the product. */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-14 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary-deep)]">
              Loyalty for local Nepal
            </span>
            <h1 className="mt-4 font-display text-[40px] font-bold leading-[1.05] tracking-tight lg:text-[56px]">
              Turn every rupee into a reason to come back.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--muted)]">
              {PLATFORM_NAME} gives your cafe a points program that works like money — customers
              earn a share of every bill and spend it right back at your counter. No app to
              install, no punch cards, no hardware.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/admin-login">
                  Start your program <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/explore">See it as a customer</Link>
              </Button>
            </div>

            {/* Facts about how the product works, not invented traction. */}
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
              {[
                { v: "10%", k: "of a bill back — your call" },
                { v: "30s", k: "single-use earn code" },
                { v: "0", k: "app installs needed" },
              ].map((s) => (
                <div key={s.k} className="border-t border-[var(--line)] pt-3">
                  <dt className="font-numeral text-[32px] leading-none text-[var(--primary)]">
                    {s.v}
                  </dt>
                  <dd className="mt-1.5 text-xs leading-snug text-[var(--muted)]">{s.k}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* The product's own moment rather than a stock dashboard shot: what
              a customer sees the instant points land. */}
          <div className="relative mx-auto w-full max-w-[320px]">
            <div className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-field)] bg-[#B8460C] font-display text-sm font-bold text-white">
                  C
                </span>
                <span className="font-display text-sm font-bold">Your café</span>
              </div>

              <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
                Points earned
              </div>
              <div className="font-numeral text-[56px] leading-none text-[var(--primary)]">
                +10.5
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">on a Rs 105 bill</p>

              <div className="mt-5 rounded-[var(--radius-btn)] bg-[var(--surface-2)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
                  Balance
                </div>
                <div className="font-numeral text-[28px] leading-none">240</div>
                <div className="mt-3 flex flex-col gap-2">
                  {[
                    { n: "Free coffee", p: "80" },
                    { n: "Slice of cake", p: "120" },
                  ].map((r) => (
                    <div key={r.n} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--ink)]">{r.n}</span>
                      <span className="font-numeral text-lg leading-none text-[var(--primary)]">
                        {r.p}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE LOOP */}
      <section id="loop" className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="flex items-baseline gap-3">
            <span className="font-numeral text-sm text-[var(--primary)]">01</span>
            <h2 className="font-display text-2xl font-bold">The whole loop</h2>
          </div>

          {/* Numbered because this genuinely is a sequence — each step only
              makes sense after the one before it. */}
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map((s) => (
              <li key={s.n} className="border-t border-[var(--line)] pt-4">
                <span className="font-numeral text-2xl leading-none text-[var(--primary)]">
                  {s.n}
                </span>
                <h3 className="mt-2 font-display text-base font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--primary-soft)] px-5 py-4">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--primary-deep)]" />
            <p className="text-sm text-[var(--primary-deep)]">
              <span className="font-bold">Points stay where they're earned.</span> Each outlet
              keeps its own balances — even between two branches of the same chain — so customers
              always know exactly where their points live.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex items-baseline gap-3">
          <span className="font-numeral text-sm text-[var(--primary)]">02</span>
          <h2 className="font-display text-2xl font-bold">Built for the counter</h2>
        </div>

        <div className="mt-8 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-[var(--line)] pt-4">
              <f.Icon className="h-5 w-5 text-[var(--primary-deep)]" strokeWidth={1.75} />
              <h3 className="mt-2.5 font-display text-base font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MADE FOR NEPAL */}
      <section id="nepal" className="border-y border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_1fr]">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary-deep)]">
              Made for Nepal
            </span>
            <h2 className="mt-3 font-display text-[28px] font-bold leading-tight">
              Built for a mid-range Android on cafe Wi-Fi.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
              Rupees everywhere. Fast on slow networks and small screens. Campaigns judged in
              Nepal time, not a server's. It installs to the home screen like an app — because
              for your customers, it is one.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {[
              {
                k: "Rs",
                t: "Rupees, with decimals handled gracefully — 10.5 points stays 10.5, not rounded away.",
              },
              {
                k: "+5:45",
                t: "UTC+5:45 aware, so a Thursday campaign runs on Nepal's Thursday.",
              },
              {
                k: "PWA",
                t: "Add to home screen. The shell is cached; balances and claims are always live.",
              },
            ].map((r) => (
              <div key={r.k} className="flex gap-4 border-t border-[var(--line)] pt-4">
                <span className="w-16 flex-shrink-0 font-numeral text-lg leading-none text-[var(--primary)]">
                  {r.k}
                </span>
                <span className="text-sm leading-relaxed text-[var(--muted)]">{r.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl px-6 py-16">
        <h2 className="font-display text-2xl font-bold">Questions, answered</h2>
        <div className="mt-6">
          {FAQ.map((f) => (
            <Faq key={f.q} {...f} />
          ))}
        </div>
      </section>

      {/* CLOSING */}
      <section className="border-t border-[var(--line)] bg-[var(--ink)] text-[#E9F0EC]">
        <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
          <h2 className="font-display text-[30px] font-bold leading-tight text-white">
            Give people a reason to choose you again.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-[#8DA79A]">
            Set up your program in minutes. No hardware, no app store, no card on file.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/admin-login">Start your program</Link>
            </Button>
            {hasContact && (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/25 bg-transparent text-white hover:border-white hover:text-white"
              >
                <a href={contact?.email ? `mailto:${contact.email}` : `tel:${contact?.phone}`}>
                  Talk to us
                </a>
              </Button>
            )}
          </div>

          {hasContact && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#8DA79A]">
              {contact?.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-white">
                  <Phone className="h-3.5 w-3.5" /> {contact.phone}
                </a>
              )}
              {contact?.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-1.5 hover:text-white"
                >
                  <Mail className="h-3.5 w-3.5" /> {contact.email}
                </a>
              )}
              {contact?.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {contact.address}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <StampdLogo size={22} />
              <span className="font-display text-base font-bold">{PLATFORM_NAME}</span>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Points that work like money, for local business in Nepal.
            </p>
          </div>

          <div className="flex flex-wrap gap-10 text-sm">
            {[
              { h: "Customers", l: "Customer login", to: "/customer-login" },
              { h: "Businesses", l: "Staff & owner login", to: "/admin-login" },
              { h: "Platform", l: "Platform admin", to: "/platform/login" },
            ].map((c) => (
              <div key={c.h}>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
                  {c.h}
                </div>
                <Link
                  to={c.to}
                  className="mt-1.5 inline-flex items-center gap-1 font-semibold text-[var(--ink)] hover:text-[var(--primary-deep)]"
                >
                  {c.l} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-10 border-t border-[var(--line)] pt-5 text-xs text-[var(--soft)]">
          © {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
