import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { StampdLogo } from "../../../components/shared/StampdLogo";
import { PLATFORM_NAME } from "../../../lib/platform";
import { NAV_LINKS } from "./data";
import { RollingLabel, useRollingState } from "./motion/RollingLabel";
import { NavLinkItem } from "./primitives";

/**
 * Nav chrome copied from samparka.co: a centred glass pill that hides on
 * scroll-down and slides back on scroll-up.
 *
 * One deliberate deviation. samparka fills the pill with white at 15% over a
 * light page; over #14201C that same value is an opaque grey slab, so this
 * uses 6% — the value that actually reads as glass on a dark surface. Its CTA
 * is likewise inverted: samparka's dark gradient pill would be invisible here,
 * so the primary action is cream with dark ink.
 */
export function LandingNav({ contactHref }: { contactHref: string }) {
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rolling = useRollingState();

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // The 8px deadband stops the nav flickering when the hero's sticky pin
      // produces tiny scroll deltas at its boundaries.
      if (Math.abs(y - lastY) < 8) return;
      setHidden(y > lastY && y > 120);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 flex w-full justify-center transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none motion-reduce:translate-y-0 ${
        hidden && !menuOpen ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <nav
        className="mx-4 mt-4 w-full max-w-6xl rounded-[20px] border border-white/15 bg-white/[0.06] px-6 py-3 backdrop-blur-[25px] md:mx-6 md:px-8 md:py-4"
        style={{
          boxShadow:
            "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(243,236,226,0.14)",
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="flex flex-shrink-0 items-center gap-2">
            <StampdLogo size={30} />
            <span className="font-display text-lg text-[var(--lp-ink)]">{PLATFORM_NAME}</span>
          </Link>

          <ul className="hidden flex-1 items-center justify-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <NavLinkItem
                  link={link}
                  className="group relative block px-3 py-1.5 text-sm text-[var(--lp-muted)] transition-colors duration-300 hover:text-[var(--lp-ink)]"
                >
                  {link.label}
                  {/* samparka's glass chip, fading in behind the label. */}
                  <span className="absolute inset-0 -z-10 scale-90 rounded-2xl border border-white/10 bg-white/[0.06] opacity-0 backdrop-blur-[15px] transition-all duration-300 group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none" />
                </NavLinkItem>
              </li>
            ))}
          </ul>

          <div className="flex flex-shrink-0 items-center gap-2">
            {/* The marketing page is still the front door for staff — the old
                landing carried this and losing it would strand them. */}
            <Link
              to="/admin-login"
              className="hidden px-3 py-1.5 text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-ink)] sm:block"
            >
              Log in
            </Link>
            <a
              href={contactHref}
              aria-label="Talk to us"
              className="hidden items-center gap-2 rounded-[74px] bg-[var(--lp-cream)] px-5 py-2.5 text-sm font-medium text-[#14201C] transition-transform duration-200 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100 sm:inline-flex"
              {...rolling.handlers}
            >
              {/* The rolled label is duplicated and aria-hidden, so the
                  accessible name comes from aria-label above. */}
              <RollingLabel
                active={rolling.active}
                onAnimationComplete={rolling.onAnimationComplete}
              >
                Talk to us
              </RollingLabel>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                <path
                  d="M6 3l5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="rounded-2xl border border-white/10 bg-white/10 p-2 text-[var(--lp-ink)] lg:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path
                  d={menuOpen ? "M6 6l12 12M18 6L6 18" : "M4 8h16M4 16h16"}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {menuOpen ? (
          <ul className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-4 lg:hidden">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <NavLinkItem
                  link={link}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-2xl px-3 py-2.5 text-sm text-[var(--lp-muted)] hover:bg-white/[0.06] hover:text-[var(--lp-ink)]"
                />
              </li>
            ))}
            <li>
              <Link
                to="/admin-login"
                onClick={() => setMenuOpen(false)}
                className="block rounded-2xl px-3 py-2.5 text-sm text-[var(--lp-muted)] hover:bg-white/[0.06] hover:text-[var(--lp-ink)]"
              >
                Log in
              </Link>
            </li>
            <li className="mt-2">
              <a
                href={contactHref}
                className="block rounded-[74px] bg-[var(--lp-cream)] px-5 py-2.5 text-center text-sm font-medium text-[#14201C]"
              >
                Talk to us
              </a>
            </li>
          </ul>
        ) : null}
      </nav>
    </div>
  );
}
