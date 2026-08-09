import { useEffect } from "react";
import { PLATFORM_NAME } from "../../../lib/platform";

// See Privacy.tsx for the same disclaimer: tailored to what this codebase
// does, but template-grade — not reviewed by counsel.
const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "1. Agreement",
    body: (
      <p>
        By creating an account or using {PLATFORM_NAME} — as a customer, an
        outlet's staff, or a company owner — you agree to these terms. If you
        don't agree, please don't use the service.
      </p>
    ),
  },
  {
    heading: "2. Accounts",
    body: (
      <p>
        Customer accounts and staff accounts are kept separately and each needs
        its own accurate email and password. You're responsible for keeping
        your credentials safe and for anything that happens under your account.
        Each outlet's staff credentials are independent — there's no sharing of
        logins between outlets, even ones owned by the same company.
      </p>
    ),
  },
  {
    heading: "3. What points are",
    body: (
      <p>
        Points earned through {PLATFORM_NAME} are a promotional benefit offered
        by the outlet you earned them at — they are not money, have no cash
        value, and can't be transferred, sold, or exchanged for currency. Points
        earned at one outlet can only be spent at that same outlet; they don't
        pool across outlets, even ones under the same company. What a bill earns
        and what a reward costs is set by each outlet and can change going
        forward — a rate change never retroactively affects points you've
        already earned.
      </p>
    ),
  },
  {
    heading: "4. Acceptable use",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Don't attempt to earn or redeem points without a genuine transaction.</li>
        <li>Don't try to interfere with, reverse-engineer, or abuse the QR/claim system.</li>
        <li>Don't use another person's account without their permission.</li>
        <li>Don't use the service for anything unlawful.</li>
      </ul>
    ),
  },
  {
    heading: "5. Businesses on the platform",
    body: (
      <p>
        A business joins {PLATFORM_NAME} by subscribing to a plan. There's no
        payment gateway built into the app — a subscription is arranged and
        confirmed directly between the business and {PLATFORM_NAME}, and a key is
        issued to activate it. Each outlet's loyalty program (earn rate, reward
        catalog, campaigns) is configured and controlled by that business.
      </p>
    ),
  },
  {
    heading: "6. Intellectual property",
    body: (
      <p>
        The {PLATFORM_NAME} platform, its design, and its underlying software are
        owned by {PLATFORM_NAME}. Each outlet retains ownership of its own
        branding, menu, and content uploaded to its console.
      </p>
    ),
  },
  {
    heading: "7. Third-party services",
    body: (
      <p>
        Parts of the service rely on third parties — for example, email
        delivery and, if you choose to use it, Google sign-in. Your use of
        those integrations is also subject to their own terms.
      </p>
    ),
  },
  {
    heading: "8. No warranty, limited liability",
    body: (
      <p>
        {PLATFORM_NAME} is provided "as is." We work to keep it available and
        accurate, but we don't guarantee uninterrupted service, and to the
        extent the law allows, we aren't liable for indirect or consequential
        losses arising from its use.
      </p>
    ),
  },
  {
    heading: "9. Suspension and termination",
    body: (
      <p>
        We may suspend or close an account that violates these terms. A
        suspended outlet's customers keep their existing points on record, but
        can't earn or redeem while the outlet is suspended.
      </p>
    ),
  },
  {
    heading: "10. Governing law",
    body: <p>These terms are governed by the laws of Nepal.</p>,
  },
  {
    heading: "11. Changes",
    body: (
      <p>
        We may update these terms from time to time. We'll update the date
        below, and for significant changes, make a reasonable effort to let you
        know.
      </p>
    ),
  },
];

export default function Terms() {
  useEffect(() => {
    const previous = document.title;
    document.title = `Terms of Service | ${PLATFORM_NAME}`;
    document.documentElement.classList.add("landing-dark");
    return () => {
      document.title = previous;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--lp-bg)] px-6 py-24 md:px-10">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="font-mono text-[11px] tracking-[0.18em] text-[var(--lp-green)]">
          ← {PLATFORM_NAME.toUpperCase()}
        </a>
        <h1 className="mt-6 font-display text-4xl tracking-[-0.02em] text-[var(--lp-ink)]">Terms of Service</h1>
        <p className="mt-3 text-sm text-[var(--lp-muted)]">Last updated: August 2026</p>

        <p className="mt-6 rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-5 py-4 text-sm leading-relaxed text-[var(--lp-muted)]">
          This is a good-faith description of the terms {PLATFORM_NAME} operates
          under, written to match how the platform actually works — it is not a
          substitute for legal advice.
        </p>

        <div className="mt-10 flex flex-col gap-8">
          {SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="font-display text-lg text-[var(--lp-ink)]">{s.heading}</h2>
              <div className="mt-2.5 text-[15px] leading-relaxed text-[var(--lp-muted)]">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
