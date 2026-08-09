import { useEffect } from "react";
import { PLATFORM_NAME } from "../../../lib/platform";

// Both /privacy and /terms are registered in backend RESERVED_SLUGS, so no
// company can claim either slug.
//
// This is template-grade copy, tailored to what this codebase actually does
// (multi-tenant loyalty, per-outlet isolation, no payment gateway, Nepal
// hosting) rather than a generic boilerplate — but it hasn't been reviewed by
// counsel. Say so plainly rather than presenting it as final.
const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "1. Who this covers",
    body: (
      <>
        <p>
          {PLATFORM_NAME} is a loyalty platform used by many independent businesses
          ("outlets"), each running its own branded loyalty program on this
          software. This policy covers data collected by {PLATFORM_NAME} itself —
          account creation, sign-in, and the points ledger. For questions about
          how a specific outlet runs its program day to day, that outlet is the
          right place to ask; {PLATFORM_NAME} never sees or shares a customer's
          activity across outlets in a way that outlet can see (see §6 below).
        </p>
      </>
    ),
  },
  {
    heading: "2. What we collect",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong className="text-[var(--lp-ink)]">Account details</strong> — name, email
          address, phone number, and a hashed password (or a Google account
          identifier, if you sign in with Google). We never store your password
          in plain text.
        </li>
        <li>
          <strong className="text-[var(--lp-ink)]">Loyalty activity</strong> — the points you
          earn and redeem at each outlet, the bill amounts those points are
          calculated from, and timestamps of that activity.
        </li>
        <li>
          <strong className="text-[var(--lp-ink)]">Device and usage information</strong> —
          basic technical data (browser type, IP address) used for security and
          to keep the service working correctly.
        </li>
        <li>
          <strong className="text-[var(--lp-ink)]">Location</strong> — only if you grant
          permission, to sort nearby businesses in the Explore directory. Never
          collected without your explicit consent, and never stored beyond your
          session.
        </li>
      </ul>
    ),
  },
  {
    heading: "3. How we collect it",
    body: (
      <p>
        Directly from you — when you register an account, sign in, scan a QR
        code to earn or redeem points, or fill in a form. We do not buy data
        about you from third parties.
      </p>
    ),
  },
  {
    heading: "4. How we use it",
    body: (
      <p>
        To run your loyalty account: recognising you across the outlets you
        visit, calculating and tracking points, sending account-related email
        (verification, password resets, subscription reminders to businesses),
        and keeping the platform secure and working. We do not use your data
        for advertising, and we do not sell it.
      </p>
    ),
  },
  {
    heading: "5. Legal basis and consent",
    body: (
      <p>
        Under Nepal's Individual Privacy Act, 2075 (2018), we collect and process
        your personal information only with your informed consent — given when
        you register an account or sign in — and only for the purposes described
        in this policy.
      </p>
    ),
  },
  {
    heading: "6. Who we share it with",
    body: (
      <>
        <p className="mb-3">
          Every outlet's records are kept isolated from every other outlet's —
          this is a hard rule the platform is built around, not just a policy.
          An outlet you visit can see your activity <em>at that outlet</em>, and
          nothing about your activity anywhere else. The only exception is the
          owning company's own rollup across its own outlets, which stays
          private to that company.
        </p>
        <p className="mb-2">We share limited data with the following, and no one else:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Email delivery providers, to send verification and account emails.</li>
          <li>Google, if you choose to sign in with a Google account.</li>
          <li>
            Our hosting and database providers, who store the data on our
            behalf and are contractually bound to protect it.
          </li>
        </ul>
        <p className="mt-3">
          {PLATFORM_NAME} does not accept payments directly — subscriptions between
          businesses and {PLATFORM_NAME} are arranged and confirmed outside this
          app, so no card or payment data passes through our systems.
        </p>
      </>
    ),
  },
  {
    heading: "7. How long we keep it",
    body: (
      <p>
        Your points ledger is kept indefinitely as an append-only record — this
        is what lets a balance always be verifiably correct. Account details are
        kept for as long as your account is active. If you'd like your account
        deleted, contact us and we'll act on that request.
      </p>
    ),
  },
  {
    heading: "8. Security",
    body: (
      <p>
        Passwords are hashed, never stored in readable form. Access to the
        platform is controlled by signed tokens with limited scope, and every
        outlet's data is walled off from every other outlet's at the database
        query level. No system is perfectly secure, but this is the standard we
        hold ourselves to.
      </p>
    ),
  },
  {
    heading: "9. Your rights",
    body: (
      <p>
        Under the Individual Privacy Act, you have the right to know what data
        we hold about you, to correct it if it's wrong, to ask that it be
        deleted, and to complain if you believe it's been misused. Reach out
        using the contact details below for any of these.
      </p>
    ),
  },
  {
    heading: "10. Children",
    body: (
      <p>
        {PLATFORM_NAME} is not directed at children, and we don't knowingly
        collect data from anyone under 13.
      </p>
    ),
  },
  {
    heading: "11. Where your data is stored",
    body: (
      <p>
        Our infrastructure may be hosted outside Nepal. Wherever your data is
        stored, it's held to the same protections described in this policy.
      </p>
    ),
  },
  {
    heading: "12. Changes to this policy",
    body: (
      <p>
        If this policy changes materially, we'll update the date below and, for
        significant changes, make a reasonable effort to let you know.
      </p>
    ),
  },
];

export default function Privacy() {
  useEffect(() => {
    const previous = document.title;
    document.title = `Privacy Policy | ${PLATFORM_NAME}`;
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
        <h1 className="mt-6 font-display text-4xl tracking-[-0.02em] text-[var(--lp-ink)]">Privacy Policy</h1>
        <p className="mt-3 text-sm text-[var(--lp-muted)]">Last updated: August 2026</p>

        <p className="mt-6 rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-5 py-4 text-sm leading-relaxed text-[var(--lp-muted)]">
          This is a good-faith description of how {PLATFORM_NAME} handles your
          data, written to match what the software actually does — it is not a
          substitute for legal advice. If you have a specific question, talk to
          us and we'll answer directly.
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
