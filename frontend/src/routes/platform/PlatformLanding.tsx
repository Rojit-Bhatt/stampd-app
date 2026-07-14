import { useEffect } from "react";
import { Link } from "react-router-dom";
import { PLATFORM_NAME } from "../../lib/platform";

const STEPS = [
  { n: "1", t: "We set up your card", d: "Pick your reward and how many stamps it takes. Live in minutes — no app store needed." },
  { n: "2", t: "Customers scan to collect", d: "They scan a code at your counter. Each visit adds a stamp to their digital card." },
  { n: "3", t: "They earn, you keep them", d: "A full card becomes a free-reward voucher — and a reason to come back." },
];
const BENEFITS = [
  { t: "Nothing to print", d: "No paper punch cards to reorder, and customers can never lose theirs again." },
  { t: "Your brand, front & centre", d: "Your logo, colours and name — customers feel like it’s your own app." },
  { t: "See what’s working", d: "Track stamps, rewards and repeat visits from one simple dashboard." },
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

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1140px] items-center gap-3.5 px-6 py-3.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[9px] font-display font-extrabold text-white"
            style={{ background: "var(--plat)" }}
          >
            {PLATFORM_NAME.charAt(0)}
          </div>
          <span className="font-display text-[18px] font-bold">{PLATFORM_NAME}</span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/coffesarowar"
              className="rounded-[10px] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface)]"
            >
              See the app
            </Link>
            <Link
              to="/platform/login"
              className="rounded-[10px] px-4 py-2 text-sm font-bold text-white"
              style={{ background: "var(--plat)" }}
            >
              Platform admin
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1140px] items-center gap-12 px-6 py-16 md:grid-cols-[1.05fr_.95fr]">
        <div>
          <span
            className="mb-5 inline-block rounded-full px-3.5 py-1.5 text-[13px] font-bold"
            style={{ background: "var(--plat-soft)", color: "var(--plat)" }}
          >
            For cafés, salons, gyms &amp; restaurants
          </span>
          <h1 className="font-display text-[44px] font-extrabold leading-[1.05] tracking-tight md:text-[52px]">
            Give your customers a loyalty card that lives on their phone
          </h1>
          <p className="mb-7 mt-4 max-w-[480px] text-[18px] text-[var(--muted)]">
            No more paper punch cards to print, lose, or forget. Launch a branded digital stamp card
            for your business in minutes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/platform/login"
              className="rounded-[14px] px-7 py-4 text-[16px] font-bold text-white"
              style={{ background: "var(--plat)" }}
            >
              Get your loyalty app →
            </Link>
            <Link
              to="/coffesarowar"
              className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-6 py-4 text-[16px] font-bold"
            >
              See the customer app
            </Link>
          </div>
        </div>
        <div className="flex justify-center">
          <div
            className="w-[300px] rounded-[32px] p-6 text-white shadow-2xl"
            style={{ background: "linear-gradient(155deg, #B5533C, #8a3a28)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider opacity-80">Reward card</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white/20 text-xs font-extrabold">
                BH
              </span>
            </div>
            <div className="mb-5 font-display text-2xl font-extrabold">Free Coffee</div>
            <div className="grid grid-cols-4 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex aspect-square items-center justify-center rounded-full text-sm font-extrabold"
                  style={{
                    background: i < 5 ? "#fff" : "rgba(255,255,255,.1)",
                    border: `2px dashed ${i < 5 ? "#fff" : "rgba(255,255,255,.4)"}`,
                    color: i < 5 ? "#B5533C" : "rgba(255,255,255,.5)",
                  }}
                >
                  {i < 5 ? "★" : i + 1}
                </div>
              ))}
            </div>
            <div className="mt-4 text-center text-[13px] opacity-85">3 more for your next free cup</div>
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

      {/* Benefits */}
      <section className="mx-auto max-w-[1140px] px-6 py-10">
        <div
          className="grid gap-8 rounded-[28px] p-11 text-white md:grid-cols-3"
          style={{ background: "var(--plat)" }}
        >
          {BENEFITS.map((b) => (
            <div key={b.t}>
              <h3 className="mb-1.5 font-display text-xl font-bold">{b.t}</h3>
              <p className="text-sm opacity-85">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[760px] px-6 py-10">
        <h2 className="mb-6 text-center font-display text-[30px] font-extrabold">Questions, answered</h2>
        <div className="flex flex-col gap-2.5">
          {FAQS.map((f) => (
            <div key={f.q} className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5">
              <div className="mb-1 text-[15px] font-bold">{f.q}</div>
              <div className="text-sm text-[var(--muted)]">{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-6 border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-[1140px] flex-wrap items-center gap-3.5 px-6 py-8 text-sm text-[var(--muted)]">
          <span className="font-bold text-[var(--ink)]">{PLATFORM_NAME}</span>
          <span className="text-[var(--soft)]">© 2026 · Digital loyalty for local business</span>
          <Link to="/platform/login" className="ml-auto hover:text-[var(--ink)]">
            Platform admin login
          </Link>
        </div>
      </footer>
    </div>
  );
}
