import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";

import { useMotion } from "../../lib/motion";
import { Button } from "@/components/ui/button";

export type ClaimTone = "neutral" | "good" | "warn" | "bad";

const TONE_STYLES: Record<ClaimTone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--surface-2)", fg: "var(--muted)" },
  good: { bg: "var(--primary-soft)", fg: "var(--primary-deep)" },
  warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  bad: { bg: "var(--err-soft)", fg: "var(--err)" },
};

interface ClaimStateScreenProps {
  icon: ReactNode;
  tone?: ClaimTone;
  title: string;
  body: ReactNode;
  /** Optional figure block — e.g. the balance on an already-added claim. */
  figure?: { label: string; value: string };
  primary?: { label: string; to?: string; onClick?: () => void };
  secondary?: { label: string; to?: string; onClick?: () => void };
  /** Small print under the buttons — status lines, hold timers. */
  footnote?: ReactNode;
}

// Every way a claim can end other than "points landed", on one layout.
//
// These are not edge cases: a 30-second single-use code scanned by a phone on
// mobile data at a counter fails in ordinary ways all the time, and each way
// needs a different sentence and a different next step. A single generic
// "something went wrong" would leave the customer standing there not knowing
// whether to re-scan, ask staff, or just wait.
//
// The tone is doing real work — "already added" is a SUCCESS wearing a
// non-celebratory face, and must never be styled like a failure.
export function ClaimStateScreen({
  icon,
  tone = "neutral",
  title,
  body,
  figure,
  primary,
  secondary,
  footnote,
}: ClaimStateScreenProps) {
  const m = useMotion();
  const style = TONE_STYLES[tone];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-10">
      <motion.div
        initial={m.pick({ opacity: 0, y: 14 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={m.spring("cardEnter")}
        className="w-full max-w-sm text-center"
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: style.bg, color: style.fg }}
        >
          {icon}
        </div>

        <h1 className="mt-5 font-display text-xl font-bold text-[var(--ink)]">{title}</h1>
        <div className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{body}</div>

        {figure && (
          <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
              {figure.label}
            </div>
            <p className="mt-1.5 font-numeral text-4xl leading-none text-[var(--ink)]">
              {figure.value}
            </p>
          </div>
        )}

        {(primary || secondary) && (
          <div className="mt-7 flex flex-col gap-2.5">
            {primary &&
              (primary.to ? (
                <Button asChild size="lg" className="w-full">
                  <Link to={primary.to}>{primary.label}</Link>
                </Button>
              ) : (
                <Button size="lg" className="w-full" onClick={primary.onClick}>
                  {primary.label}
                </Button>
              ))}
            {secondary &&
              (secondary.to ? (
                <Button asChild variant="ghost">
                  <Link to={secondary.to}>{secondary.label}</Link>
                </Button>
              ) : (
                <Button variant="ghost" onClick={secondary.onClick}>
                  {secondary.label}
                </Button>
              ))}
          </div>
        )}

        {footnote && <div className="mt-5 text-xs text-[var(--soft)]">{footnote}</div>}
      </motion.div>
    </div>
  );
}

export default ClaimStateScreen;
