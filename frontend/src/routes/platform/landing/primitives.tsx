import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useCountUp } from "../../../hooks/useCountUp";
import type { NavLink } from "./data";

/** Small letterspaced label. The one place the landing page uses solid green. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--lp-green)]">
      {children}
    </p>
  );
}

export function SectionHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-display text-3xl leading-[1.1] text-[var(--lp-ink)] sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-base text-[var(--lp-muted)]">{subtitle}</p>
      ) : null}
    </div>
  );
}

/**
 * The page's button geometry, borrowed from samparka.co's nav CTA:
 * rounded-[74px] with a scale-on-hover. `tone` picks which of the two
 * treatments applies — cream is the primary action, outline is secondary.
 */
export function CtaPill({
  href,
  tone = "cream",
  className = "",
  children,
}: {
  href: string;
  tone?: "cream" | "outline";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    cream: "bg-[var(--lp-cream)] text-[#14201C] hover:scale-105",
    outline:
      "border border-[var(--lp-line)] text-[var(--lp-ink)] hover:border-[var(--lp-ink)]/40 hover:scale-105",
  };
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-[74px] px-6 py-3 text-sm font-medium transition-transform duration-200 motion-reduce:transition-none motion-reduce:hover:scale-100 ${tones[tone]} ${className}`}
    >
      {children}
    </a>
  );
}

/**
 * A hero figure. Numerals use the serif numeral face, as they do everywhere
 * else in this product — a figure should read like money in a passbook.
 * Counts up once on mount; under reduced motion `useCountUp` returns the
 * final value immediately, because the number is information first.
 */
export function StatValue({ value, label }: { value: number; label: string }) {
  const animated = useCountUp(value);
  return (
    <div>
      <p className="font-numeral text-3xl text-[var(--lp-ink)] sm:text-4xl">
        {Math.round(animated).toLocaleString()}
      </p>
      <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-[var(--lp-muted)]">
        {label}
      </p>
    </div>
  );
}

/**
 * One nav entry, rendered as a router <Link> or a plain anchor depending on
 * its `kind`. Shared so the desktop nav, the mobile menu and the footer cannot
 * drift — a route rendered as `<a href>` would trigger a full page reload and
 * throw away the SPA.
 *
 * `children` overrides the label for call sites that decorate it (the desktop
 * nav nests a glass hover chip inside the link).
 */
export function NavLinkItem({
  link,
  className,
  onClick,
  children,
}: {
  link: NavLink;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const content = children ?? link.label;

  if (link.kind === "route") {
    return (
      <Link to={link.to} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <a href={link.href} className={className} onClick={onClick}>
      {content}
    </a>
  );
}
