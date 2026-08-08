import { Link } from "react-router-dom";

import { StampdLogo } from "../../../components/shared/StampdLogo";
import { usePlatformContact } from "../../../hooks/usePlatformContact";
import { PLATFORM_NAME } from "../../../lib/platform";
import { FOOTER_LINKS } from "./data";
import { FooterReveal } from "./motion/FooterReveal";
import { NavLinkItem } from "./primitives";
import { SOCIAL_ICONS, SOCIAL_LABELS, SOCIAL_ORDER, type SocialKey } from "./socialIcons";
import { toWaNumber } from "./WhatsAppFloat";

// Sign-in is reached through the single navbar "Log in" button -> /login now
// (see LoginSelect.tsx), so the footer no longer needs its own column of
// console links.

const LEGAL_LINKS = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
];

function Column({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-green)]">
        {heading}
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">{children}</ul>
    </div>
  );
}

const linkClass =
  "text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-ink)]";

/**
 * The footer, uncovered by the dark page scrolling off it.
 *
 * It wears the nav's glass recipe — same white/6% fill, same white/15 border,
 * same blur and shadow — so the two pieces of chrome read as a pair bracketing
 * the page. Because the reveal leaves nothing behind it, the border and the
 * inset top highlight are what actually separate it from the background; the
 * 6% fill alone would disappear. Inset and rounded on all corners, like
 * samparka.co's footer panel, so it reads as a panel rather than a bleed.
 *
 * Dropped from the source: the Recognition award grid (Stampd has none, and
 * inventing logos is worse than showing nothing) and the overlapping "Let's
 * get started" card (CtaSection already does that job).
 */
export function LandingFooter() {
  const { data: contact } = usePlatformContact();
  const socials = contact?.socials;

  // Only render a network whose URL is actually set — an unconfigured platform
  // shows no dead icons.
  const socialEntries = SOCIAL_ORDER.filter(
    (key) => socials && socials[key as SocialKey],
  ) as SocialKey[];

  const waNumber = contact?.phone ? toWaNumber(contact.phone) : "";

  return (
    <FooterReveal>
      <div className="px-4 pb-4 md:px-6 md:pb-6">
        <footer
          className="mx-auto w-full max-w-6xl rounded-[32px] border border-white/15 bg-white/[0.06] px-6 py-12 backdrop-blur-[25px] sm:px-10 md:px-14 md:py-16"
          style={{
            boxShadow:
              "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(243,236,226,0.14)",
          }}
        >
          {/* Steps 1 -> 2 -> 3 columns. Without the 2-column middle step the
              footer stacks into a single tall column at tablet widths, and a
              revealed footer taller than the viewport can never be fully
              uncovered. */}
          <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <StampdLogo size={30} />
                <span className="font-display text-lg text-[var(--lp-ink)]">
                  {PLATFORM_NAME}
                </span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--lp-muted)]">
                Points that work like money, for local business in Nepal.
              </p>

              {waNumber ? (
                <a
                  href={`https://wa.me/${waNumber}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-7 inline-flex items-center gap-3 rounded-[74px] border border-white/15 bg-white/[0.06] py-3 pl-4 pr-5 text-sm font-medium text-[var(--lp-ink)] transition-transform duration-200 hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path
                      d="M20 11.7a8 8 0 0 1-11.9 7L4 20l1.4-4a8 8 0 1 1 14.6-4.3Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9.2 9.4c.3 1.9 2 3.6 3.9 3.9l.9-1.1 1.6.7c-.2 1-1.1 1.5-2.1 1.4-2.6-.3-4.7-2.4-5-5-.1-1 .4-1.9 1.4-2.1l.7 1.6-1.4.6Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>
                    Chat on WhatsApp
                    <span className="mt-0.5 block font-mono text-[11px] tracking-wide text-[var(--lp-muted)]">
                      {contact?.phone}
                    </span>
                  </span>
                </a>
              ) : null}

              {socialEntries.length > 0 ? (
                <div className="mt-8 flex flex-wrap gap-3">
                  {socialEntries.map((key) => (
                    <a
                      key={key}
                      href={socials![key]}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={SOCIAL_LABELS[key]}
                      title={SOCIAL_LABELS[key]}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-[var(--lp-muted)] transition-colors hover:border-white/30 hover:text-[var(--lp-ink)]"
                    >
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                        {SOCIAL_ICONS[key]}
                      </svg>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            <Column heading="Product">
              {FOOTER_LINKS.map((link) => (
                <li key={link.label}>
                  <NavLinkItem link={link} className={linkClass} />
                </li>
              ))}
            </Column>

            <Column heading="Company">
              {LEGAL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              {contact?.email ? (
                <li>
                  <a href={`mailto:${contact.email}`} className={linkClass}>
                    {contact.email}
                  </a>
                </li>
              ) : null}
            </Column>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 md:mt-14">
            <span className="text-xs text-[var(--lp-muted)]">
              © {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.
            </span>
            {contact?.address ? (
              <span className="text-xs text-[var(--lp-muted)]">{contact.address}</span>
            ) : null}
          </div>
        </footer>
      </div>
    </FooterReveal>
  );
}
