import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { Fragment, useRef } from "react";

// Technique from motion.dev's "text scroll word reveal" example: each word
// owns a slice of the section's scroll progress and fades from dim to solid
// across it. Slices overlap (SPREAD < 1 while WORD_DURATION stays wide), so
// the reveal cascades rather than ticking word by word.
const START_OPACITY = 0.15;
const SPREAD = 0.8;
const WORD_DURATION = 0.2;

function wordRange(index: number, count: number) {
  const start = count <= 1 ? 0 : (index / (count - 1)) * SPREAD;
  return { start, end: Math.min(1, start + WORD_DURATION) };
}

function Word({
  children,
  progress,
  index,
  count,
  still,
}: {
  children: string;
  progress: MotionValue<number>;
  index: number;
  count: number;
  still: boolean;
}) {
  const { start, end } = wordRange(index, count);
  const opacity = useTransform(progress, (latest) => {
    if (latest <= start) return START_OPACITY;
    if (latest >= end) return 1;
    return START_OPACITY + (1 - START_OPACITY) * ((latest - start) / (end - start));
  });

  // Word spans are hidden from assistive tech; the paragraph carries the whole
  // statement as its label, so it is announced as one sentence rather than a
  // list of words.
  return (
    <motion.span aria-hidden="true" style={still ? undefined : { opacity }}>
      {children}
    </motion.span>
  );
}

/**
 * Deviation from the source example, deliberately: the example pins a tall
 * sticky stage (offset start-start -> end-end). This page already pins the
 * hero and reveals the footer on scroll, so a third pinned stage would add a
 * viewport of scroll and risk fighting the hero's pin boundaries. Here the
 * reveal is pass-through — the words light as the section crosses the
 * viewport, with no pin and no added page height.
 */
export function WordReveal({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const words = text.split(" ");

  return (
    <p ref={ref} className={className} aria-label={text}>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <Word
            progress={scrollYProgress}
            index={index}
            count={words.length}
            still={Boolean(reduced)}
          >
            {word}
          </Word>
          {index < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </p>
  );
}
