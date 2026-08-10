import { useState, useEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useMotionValueEvent } from "motion/react";

import { useMyTenants, type MyTenantMembership } from "../../hooks/useMyTenants";
import { useExploreHero } from "../../context/ExploreHeroContext";
import { formatPoints } from "../../hooks/usePoints";
import { resolveImageUrl } from "../../lib/images";
import { tenantPath } from "../../lib/tenantPath";
import { useMotion } from "../../lib/motion";

// Every card is this tall; the peek math below is measured against it.
const CARD_HEIGHT = 200;
// Front card + this many peeking layers behind it = 3 visible cards max.
const MAX_PEEK_DEPTH = 2;

// How much of each peeking card's top edge clears the card in front of it,
// in px from the stack's top — enough to read the outlet name, not just a
// sliver. Tuned against the card's own pt-5 (20px) + logo/name row height.
const PEEK_TOP = [0, 64, 116];
const PEEK_SCALE = [1, 0.945, 0.89];
const PEEK_OPACITY = [1, 1, 0.92];

// Room the stack needs above its cards for the deepest peek to clear
// overflow-hidden, plus the card's own height and a shadow gutter below.
const STACK_TOP_OFFSET = PEEK_TOP[2] + 18; // 134
const HERO_HEIGHT = STACK_TOP_OFFSET + CARD_HEIGHT + 28; // 362

// The radius of the U-shaped notch cut into the top-center edge of the
// front card — a physical "stub" cutout like a stacked wallet card, rather
// than a floating avatar badge.
const CUTOUT_RADIUS = 18;

function cardShadow(brand: string): string {
  return `0 24px 48px -24px color-mix(in srgb, ${brand} 45%, rgba(5,16,13,0.85)),
          0 8px 20px -12px rgba(5,16,13,0.45),
          inset 0 1px 0 0 rgba(255,255,255,0.16)`;
}

// A moody glass-like surface derived from the outlet's own brand colour —
// capped so it stays dark and legible for any brand hex, from near-black to
// pure white, while still reading as that outlet's identity. When the
// outlet has uploaded a banner photo, it shows through underneath a
// translucent version of the same tint rather than being replaced by it.
function cardSurface(brand: string, banner: string | null): CSSProperties {
  if (!banner) {
    return {
      backgroundImage: `linear-gradient(148deg,
        color-mix(in srgb, ${brand} 34%, #0A1411) 0%,
        color-mix(in srgb, ${brand} 20%, #0A1411) 52%,
        color-mix(in srgb, ${brand} 8%, #05100D) 100%)`,
      boxShadow: cardShadow(brand),
    };
  }
  return {
    backgroundImage: `linear-gradient(148deg,
        color-mix(in srgb, color-mix(in srgb, ${brand} 45%, #0A1411) 75%, transparent) 0%,
        color-mix(in srgb, color-mix(in srgb, ${brand} 25%, #0A1411) 55%, transparent) 55%,
        color-mix(in srgb, color-mix(in srgb, ${brand} 10%, #05100D) 88%, transparent) 100%),
      url(${banner})`,
    backgroundSize: "cover, cover",
    backgroundPosition: "center, center",
    boxShadow: cardShadow(brand),
  };
}

export function OutletCardStack() {
  const { data: memberships = [] } = useMyTenants();
  const { setHeroColor, progress, headerHeight } = useExploreHero();
  const [activeIndex, setActiveIndex] = useState(0);

  const count = memberships.length;
  const activeIdx = count ? ((activeIndex % count) + count) % count : 0;
  const activeColor = memberships[activeIdx]?.branding.primaryColor ?? null;

  useEffect(() => {
    setHeroColor(activeColor);
    return () => setHeroColor(null);
  }, [activeColor, setHeroColor]);

  // The spacer's height is a plain constant — it must never depend on scroll
  // progress. It exists purely to reserve HERO_HEIGHT of scroll distance so
  // useScroll below has a stable, non-circular measurement to read from.
  // (Measuring against the collapsing element itself, as this used to do,
  // meant the element's own shrinking height fed back into how much further
  // scrolling would shrink it — a feedback loop that made the collapse
  // accelerate and stutter instead of tracking the scroll linearly.)
  const spacerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: spacerRef, offset: ["start start", "end start"] });

  useMotionValueEvent(scrollYProgress, "change", (v) => progress.set(v));

  const sectionHeight = useTransform(scrollYProgress, [0, 1], [HERO_HEIGHT, 0]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.6, 1], [1, 0, 0]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -24]);

  if (memberships.length === 0) return null;

  const handleSwipe = (direction: "next" | "prev") => {
    setActiveIndex((i) => {
      const next = direction === "next" ? i + 1 : i - 1;
      return ((next % count) + count) % count;
    });
  };

  return (
    <div ref={spacerRef} className="relative mb-8" style={{ height: HERO_HEIGHT }}>
      {/* Sticky, not just absolutely positioned: pinned directly below the
          header for the whole HERO_HEIGHT scroll distance the spacer above
          reserves, so scrolling the page collapses the cards in place before
          the Discover grid underneath starts moving at all. Once the spacer
          is fully scrolled past, this releases and Discover's heading lands
          right at the top, under the header, with no gap. */}
      <motion.div
        className="sticky z-10 flex justify-center overflow-hidden"
        style={{ top: headerHeight, height: sectionHeight }}
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-1 h-6 shadow-[0_12px_20px_-8px_rgba(20,32,28,0.3)]"
          style={{ opacity: scrollYProgress }}
        />
        <motion.div
          className="relative mt-[134px] w-full max-w-[400px]"
          style={{ opacity: contentOpacity, y: contentY }}
        >
          {memberships.map((m, i) => {
            const depth = (i - activeIdx + count) % count;
            if (depth > MAX_PEEK_DEPTH) return null;
            return (
              <OutletCard
                key={m.organizationId}
                membership={m}
                depth={depth}
                onTap={() => setActiveIndex(i)}
                onSwipe={handleSwipe}
              />
            );
          })}
        </motion.div>
      </motion.div>
    </div>
  );
}

function OutletCard({
  membership,
  depth,
  onTap,
  onSwipe,
}: {
  membership: MyTenantMembership;
  depth: number;
  onTap: () => void;
  onSwipe: (direction: "next" | "prev") => void;
}) {
  const m = useMotion();
  const brand = membership.branding.primaryColor;
  const logo = resolveImageUrl(membership.branding.logoImageId, membership.branding.logoUrl);
  const banner = resolveImageUrl(membership.branding.bannerImageId, membership.branding.bannerUrl) || null;
  const initial = membership.name.charAt(0).toUpperCase();

  const logoBoxClassName = "h-10 w-10 rounded-[12px] ring-1 ring-white/25 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.6)]";

  const content = (
    <div className="relative z-10 flex flex-1 flex-col px-6 pt-5 pb-6">
      <div className="flex items-center gap-3">
        {logo ? (
          <img src={logo} alt="" className={`${logoBoxClassName} bg-white object-cover`} />
        ) : (
          <div
            className={`${logoBoxClassName} flex items-center justify-center font-display text-lg font-bold text-[#0A1411]`}
            style={{ background: `color-mix(in srgb, ${brand} 72%, #FFFFFF)` }}
          >
            {initial}
          </div>
        )}
        <div className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-[#F4F8F6]">
          {membership.name}
        </div>
      </div>
      <div className="mt-auto">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">Points balance</div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-numeral text-[44px] leading-none text-[#5EE9A4]">
            {formatPoints(membership.balance)}
          </span>
          <span className="text-sm text-white/60">pts</span>
        </div>
      </div>
    </div>
  );

  const sheen = (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `linear-gradient(125deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 28%, rgba(255,255,255,0) 48%),
          radial-gradient(120% 95% at 88% 106%, color-mix(in srgb, ${brand} 55%, transparent) 0%, transparent 62%)`,
      }}
    />
  );

  const cardClassName =
    "absolute inset-x-0 top-0 flex min-h-[200px] flex-col overflow-hidden rounded-[22px] border border-white/12";
  const scale = PEEK_SCALE[depth];
  const animate = {
    y: -PEEK_TOP[depth] - ((1 - scale) * CARD_HEIGHT) / 2,
    scale,
    opacity: PEEK_OPACITY[depth],
  };
  // Softer and slower than the app's default `settle` spring — this is a
  // large element the eye tracks across the whole swipe, not a small one
  // that just needs to arrive.
  const transition = m.spring("cardGlide");

  if (depth === 0) {
    // A physical notch bitten into the top-center edge, like a card tucked
    // into a wallet slot — replaces a floating avatar badge that read as
    // decoration rather than part of the card itself.
    const cutout = `radial-gradient(circle ${CUTOUT_RADIUS}px at 50% 0px, transparent 99%, black 100%)`;
    return (
      <motion.div
        className={cardClassName}
        style={{
          zIndex: 10 - depth,
          ...cardSurface(brand, banner),
          maskImage: cutout,
          WebkitMaskImage: cutout,
        }}
        animate={animate}
        transition={transition}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.5}
        onDragEnd={(_event, info) => {
          const DISTANCE_THRESHOLD = 60;
          const VELOCITY_THRESHOLD = 500;
          if (info.offset.y < -DISTANCE_THRESHOLD || info.velocity.y < -VELOCITY_THRESHOLD) {
            onSwipe("next");
          } else if (info.offset.y > DISTANCE_THRESHOLD || info.velocity.y > VELOCITY_THRESHOLD) {
            onSwipe("prev");
          }
        }}
      >
        {sheen}
        <Link to={tenantPath(membership.companySlug, membership.slug, "dashboard")} className="flex flex-1 flex-col">
          {content}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onTap}
      aria-label={`Show ${membership.name}`}
      className={`${cardClassName} text-left`}
      style={{ zIndex: 10 - depth, ...cardSurface(brand, banner) }}
      animate={animate}
      transition={transition}
    >
      {sheen}
      {content}
    </motion.button>
  );
}
