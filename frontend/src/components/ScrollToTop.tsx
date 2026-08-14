import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// React Router does not touch window.scrollY on a client-side navigation —
// only a real document load does. So opening an outlet from a card halfway
// down /explore landed on that outlet's dashboard already scrolled to the
// offset the Discover list had, which reads as a broken page.
//
// Only a NEW entry (PUSH/REPLACE) resets. Back and forward (POP) keep
// whatever offset the browser restored, which is the behaviour a customer
// expects returning to a long list they had scrolled through.
//
// A URL with a hash is left alone: the fragment target is the intended
// scroll position, and stealing it back to 0 would break in-page anchors.
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    if (hash) return;
    // "instant", not the default: the landing sets `scroll-behavior: smooth`
    // on <html>, and a route change should land at the top, not animate its
    // way there past the outgoing page's content.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);

  return null;
}

export default ScrollToTop;
