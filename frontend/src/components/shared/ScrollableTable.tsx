import { useEffect, useRef, useState } from "react";

interface ScrollableTableProps {
  children: React.ReactNode;
  /**
   * Minimum width of the inner column strip. When the container is narrower
   * than this, the whole table slides sideways; when wider, the min-width is
   * inert and the table keeps its normal desktop layout.
   */
  minContentWidth: string;
  /**
   * True by default: the first cell of every row (header + body) is pinned to
   * the left edge while the table scrolls, with a thin divider on its right.
   */
  stickyFirst?: boolean;
  className?: string;
}

/**
 * Makes a multi-column data table horizontally scrollable on narrow screens
 * (phones / portrait tablets) while keeping the desktop layout untouched:
 *
 *  - The outer card is `overflow-x-auto`; the inner strip carries
 *    `min-w-[<minContentWidth>]` so columns never squash and text never
 *    truncates into "C…" / "Co…".
 *  - `stickyFirst` pins the first column of every row (including the header)
 *    to the left edge during sideways scroll, above a hairline divider.
 *  - A right-edge fade gradient hints that the table scrolls; it is only
 *    visible while content actually overflows and hidden on desktop widths.
 *
 * Pure layout enhancement — pass through the existing header/body markup
 * unchanged.
 */
export function ScrollableTable({
  children,
  minContentWidth,
  stickyFirst = true,
  className = "",
}: ScrollableTableProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Desktop widths never scroll — skip the listener and the fade entirely.
    const desktop = window.matchMedia("(min-width: 1024px)");
    if (desktop.matches) return;

    const check = () => {
      // Keep a 4 px slack so the fade doesn't flicker at the exact edge.
      const overflowing = el.scrollWidth - el.clientWidth - el.scrollLeft > 4;
      setShowFade(overflowing);
    };

    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // Rows can change height/content after load (images, skeletons), so
    // re-check once shortly after mount.
    const t = setTimeout(check, 600);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      clearTimeout(t);
    };
  }, []);

  return (
    <div
      ref={scrollerRef}
      className={`relative overflow-x-auto rounded-[var(--radius-card)] bg-[var(--surface)] shadow-ambient ${className}`}
      tabIndex={0}
      aria-label="Scrollable table"
    >
      <div
        className={stickyFirst ? "scrollable-table-sticky-first" : undefined}
        style={{ minWidth: minContentWidth }}
      >
        {children}
      </div>

      {/* Right-edge fade: only while the table overflows and never on desktop. */}
      {showFade && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-11 lg:hidden"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--surface))",
          }}
        />
      )}
    </div>
  );
}

/**
 * Convenience class added to the first cell of every row so it pins while the
 * table scrolls. Apply to the header cell and the body's first cell of the
 * same column track. `z-[1]` sits above plain cells; rows keep their hover
 * paint because the pinned cell lives inside the row.
 */
export const STICKY_FIRST_CELL =
  "sticky left-0 z-[1] bg-[var(--surface)] border-r border-[var(--line)]";

/**
 * When the scroller carries `scrollable-table-sticky-first`, every first cell
 * (`> :first-child` of each grid row) pins to the left edge during sideways
 * scroll. Rows are expected to be a single-element-per-cell grid (or have a
 * top-level cell element); per-cell `STICKY_FIRST_CELL` still wins when finer
 * control is needed.
 */
export const STICKY_FIRST_TABLE_CLASS = "scrollable-table-sticky-first";
