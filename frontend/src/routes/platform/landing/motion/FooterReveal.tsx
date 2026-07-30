import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Sticky under-page footer, reimplemented from motion.dev's documented
 * "footer reveal" technique (the example's source is behind Motion+).
 *
 * The footer is fixed at the bottom of the viewport BEHIND the page content;
 * a spacer of equal height at the end of the document reserves its space, so
 * scrolling to the end slides the (opaque) page content off it and uncovers
 * it. `useScroll` over that spacer drives the opacity fade.
 *
 * This only works because the page background is fully opaque — see the
 * .landing-dark background-color rule in index.css.
 */
export function FooterReveal({ children }: { children: ReactNode }) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);

  // The spacer must exactly match the footer's rendered height, and that
  // height depends on viewport width (the link row wraps). Measured rather
  // than assumed, and re-measured on resize.
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  const { scrollYProgress } = useScroll({
    target: spacerRef,
    offset: ["start end", "end end"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.6], [0, 1]);

  if (reduced) {
    // No sticky behaviour, no fade: an ordinary block at the end of the page.
    return <div ref={footerRef}>{children}</div>;
  }

  return (
    <>
      <div ref={spacerRef} style={{ height }} aria-hidden="true" />
      <motion.div
        ref={footerRef}
        style={{ opacity }}
        className="fixed inset-x-0 bottom-0 -z-10"
      >
        {children}
      </motion.div>
    </>
  );
}
