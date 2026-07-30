import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Sticky under-page footer, reimplemented from motion.dev's documented
 * "footer reveal" technique (the example's source is behind Motion+).
 *
 * The footer is fixed at the bottom of the viewport BEHIND the page content;
 * a spacer of equal height at the end of the document reserves its space, so
 * scrolling to the end slides the (opaque) page content off it and uncovers
 * it. Scroll position drives the opacity fade.
 *
 * This only works because the page background is fully opaque — see the
 * .landing-dark background-color rule in index.css.
 *
 * Progress is computed from the spacer's LIVE geometry on each frame rather
 * than from `useScroll`'s `target`/`offset` form. That form resolves the
 * target's offsets once, and this spacer's height is only known after the
 * footer has been measured — so the offsets resolve against a zero-height
 * element and the range collapses to nothing, leaving the footer permanently
 * invisible. Reading the rect per frame has no such ordering dependency, and
 * it stays correct when the footer reflows.
 */

export function FooterReveal({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  const spacerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  // A CALLBACK ref, not a plain one, so the observer always tracks whichever
  // node is currently mounted rather than a stale detached one.
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;

    const measure = () => {
      setHeight(node.offsetHeight);
      setViewport(window.innerHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (nodeRef.current) setHeight(nodeRef.current.offsetHeight);
      setViewport(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      observerRef.current?.disconnect();
    };
  }, []);

  const { scrollY } = useScroll();

  // scrollY is used purely as a per-frame ticker; the actual progress comes
  // from where the spacer currently sits. 0 when its top is at the viewport
  // bottom (nothing uncovered), 1 when its bottom is (fully uncovered), and
  // fully opaque at 60% so the footer has settled before scrolling stops.
  const opacity = useTransform(scrollY, () => {
    const el = spacerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return 0;
    const progress = (window.innerHeight - rect.top) / rect.height;
    return Math.max(0, Math.min(1, progress / 0.6));
  });

  // A fixed footer taller than the viewport can never be fully uncovered — its
  // top is simply off-screen with no way to scroll to it. Narrow windows stack
  // the footer's columns and hit this easily, so above that threshold the
  // reveal is abandoned and the footer becomes an ordinary scrollable block.
  const tooTallToReveal = height > 0 && viewport > 0 && height >= viewport;

  if (reduced || tooTallToReveal) {
    return <div ref={measureRef}>{children}</div>;
  }

  return (
    <>
      {/* pointer-events-none is load-bearing: the spacer is transparent but
          sits in normal flow ABOVE the z-index -10 footer, so without it every
          footer link, social icon and the WhatsApp button would be dead to
          clicks once revealed. */}
      <div
        ref={spacerRef}
        style={{ height }}
        aria-hidden="true"
        className="pointer-events-none"
      />
      {/* z-0, NOT a negative z-index. A negative z-index paints the footer
          behind its own ancestors, so <main> would swallow every click on it.
          At z-0 the scrolling content above (which carries `relative z-10`
          and an opaque background) still covers it on the way down, but once
          uncovered the footer is genuinely on top and its links work. */}
      <motion.div
        ref={measureRef}
        style={{ opacity }}
        className="fixed inset-x-0 bottom-0 z-0"
      >
        {children}
      </motion.div>
    </>
  );
}
