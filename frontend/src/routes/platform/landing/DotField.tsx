import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Interactive dot field — the hero background.
 *
 * Ports the behaviour of kokonutui's `mouse-effect-card`
 * (https://kokonutui.com/docs/cards/mouse-effect-card, MIT, @dorianbaffier)
 * but draws to a single <canvas> from one rAF loop instead of rendering each
 * dot as a motion component.
 *
 * That change is the whole point. The original gives every dot three
 * useTransforms, three useSprings and an infinite opacity tween — fine at its
 * native card size (~400 dots), but this is a full-bleed hero: at 1280x800
 * with 16px spacing it would be ~4,000 dots and ~12,000 concurrent springs.
 * The people this product is sold to are running it on mid-range Android
 * phones. One loop over a flat array holds frame rate; 4,000 components does
 * not.
 *
 * Behaviour preserved from the original: centre-weighted random cull so
 * density falls toward the edges, repulsion force (1 - d/r) * strength along
 * the cursor vector, eased return to base, a proximity opacity boost inside
 * radius * 1.2, and a slow per-dot twinkle phase-offset by index.
 */

const SPACING = 22;
const DOT_RADIUS = 1.1;
const REPULSION_RADIUS = 120;
const REPULSION_STRENGTH = 26;
const RETURN = 0.12; // spring pull toward base
const FRICTION = 0.82; // damping, so dots settle rather than oscillate
const PROXIMITY_MULTIPLIER = 1.2;
const PROXIMITY_OPACITY_BOOST = 0.8;
const BASE_OPACITIES = [0.18, 0.3, 0.42];

interface Dot {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  phase: number;
}

function generateDots(width: number, height: number): Dot[] {
  const dots: Dot[] = [];
  const cols = Math.ceil(width / SPACING);
  const rows = Math.ceil(height / SPACING);
  const cx = width / 2;
  const cy = height / 2;
  const maxDistance = Math.sqrt(cx * cx + cy * cy);

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const x = col * SPACING;
      const y = row * SPACING;
      const dx = x - cx;
      const dy = y - cy;
      const edgeFactor = Math.min(Math.sqrt(dx * dx + dy * dy) / (maxDistance * 0.7), 1);
      // Same cull as the original: denser at the centre, thinning outward.
      if (Math.random() > edgeFactor) continue;

      dots.push({
        baseX: x,
        baseY: y,
        x,
        y,
        vx: 0,
        vy: 0,
        opacity: BASE_OPACITIES[(row + col) % 3] * edgeFactor,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  return dots;
}

export function DotField({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let frame: number | null = null;
    let running = false;
    const pointer = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width === 0 || height === 0) return;
      // Cap at 2: a 3x phone display would triple the fill cost for no
      // visible gain on 2px dots.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Resetting the backing store clears fillStyle, so it is re-set here
      // rather than once at setup.
      ctx.fillStyle = "#F3ECE2";
      dots = generateDots(width, height);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const px = pointer.x;
      const py = pointer.y;
      const proximityRadius = REPULSION_RADIUS * PROXIMITY_MULTIPLIER;

      for (const dot of dots) {
        const dx = dot.baseX - px;
        const dy = dot.baseY - py;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let targetX = dot.baseX;
        let targetY = dot.baseY;
        let boost = 0;

        if (distance < REPULSION_RADIUS) {
          const force = (1 - distance / REPULSION_RADIUS) * REPULSION_STRENGTH;
          const angle = Math.atan2(dy, dx);
          targetX += Math.cos(angle) * force;
          targetY += Math.sin(angle) * force;
        }
        if (distance < proximityRadius) {
          boost = (1 - distance / proximityRadius) * PROXIMITY_OPACITY_BOOST;
        }

        // Damped spring toward the target, integrated per frame — the felt
        // weight of the original's useSpring without the per-dot machinery.
        dot.vx = (dot.vx + (targetX - dot.x) * RETURN) * FRICTION;
        dot.vy = (dot.vy + (targetY - dot.y) * RETURN) * FRICTION;
        dot.x += dot.vx;
        dot.y += dot.vy;

        // Slow twinkle, phase-offset per dot so nothing pulses in sync.
        const twinkle = 0.8 + 0.2 * Math.sin(time / 1400 + dot.phase);
        const alpha = Math.min(dot.opacity * twinkle + boost, 1);

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    resize();

    if (reduced) {
      // Render the field once and never animate it. Still a texture, no motion.
      draw(0);
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onPointerLeave = () => {
      pointer.x = Number.POSITIVE_INFINITY;
      pointer.y = Number.POSITIVE_INFINITY;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // Do not burn frames on a field nobody can see.
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 },
    );
    io.observe(canvas);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      stop();
      io.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
