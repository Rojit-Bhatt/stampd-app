import { StampdLogo } from "../../../components/shared/StampdLogo";
import { usePlatformContact } from "../../../hooks/usePlatformContact";
import { FOOTER_LINKS } from "./data";
import { FooterReveal } from "./motion/FooterReveal";

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
};

/**
 * samparka.co's footer, inverted: a cream panel with dark ink, uncovered by
 * the dark page scrolling away over it.
 *
 * The rounded step lives on the PAGE's bottom edge rather than here (see
 * PlatformLanding), because a revealed footer is uncovered rather than slid
 * into view — the dark surface ends in rounded corners that sweep off it.
 *
 * Dropped from the source: the Recognition award grid (Stampd has none, and
 * inventing logos is worse than showing nothing) and the overlapping "Let's
 * get started" card (CtaSection already does that job).
 */
export function LandingFooter() {
  const { data: contact } = usePlatformContact();
  const socials = contact?.socials;

  // Only render an icon whose URL is actually configured — an unconfigured
  // platform shows no dead links.
  const socialEntries = socials
    ? (Object.entries(socials) as [string, string][]).filter(([, url]) => Boolean(url))
    : [];

  return (
    <FooterReveal>
      <footer className="flex min-h-[60vh] items-end bg-[var(--lp-cream)] px-6 pb-10 pt-20 text-[#14201C] sm:px-10 md:px-16 lg:px-20">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex items-center gap-2">
            <StampdLogo size={30} />
            <span className="font-display text-lg">Stampd</span>
          </div>

          <nav className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-[#14201C]/70 transition-colors hover:text-[#14201C]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {socialEntries.length > 0 ? (
            <div className="mt-6 flex gap-5">
              {socialEntries.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-[#14201C]/60 transition-colors hover:text-[#14201C]"
                >
                  {SOCIAL_LABELS[key] ?? key}
                </a>
              ))}
            </div>
          ) : null}

          <div className="mt-10 border-t border-[#14201C]/10 pt-6">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-xs text-[#14201C]/60">
              <span>© {new Date().getFullYear()} Stampd.</span>
              <a href="/privacy" className="underline-offset-4 hover:underline">
                Privacy Policy
              </a>
              <a href="/terms" className="underline-offset-4 hover:underline">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </FooterReveal>
  );
}
