import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useMotion } from "../../../lib/motion";
import { StampdLogo } from "../StampdLogo";

// Three loyalty-domain glyphs orbiting the logo, replacing what a generic
// tech-stack reference would show as HTML/CSS/JS icons. Hand-built inline
// SVGs matching StampdLogo's own style rather than a new icon dependency.
const GLYPHS = [
  // A point/coin mark.
  <circle key="coin" cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  // A QR corner.
  <path
    key="qr"
    d="M4 4h6v6H4zM4 6.5h4M6.5 4v4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  />,
  // A receipt.
  <path
    key="receipt"
    d="M5 3h10v16l-2-1.5L11 19l-2-1.5L7 19l-2-1.5V3Z M7 7h6M7 10h6M7 13h4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinejoin="round"
  />,
];

function OrbitingGlyph({ index, total, reduced }: { index: number; total: number; reduced: boolean }) {
  const angle = (index / total) * 360;
  const radius = 96;
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-[var(--lp-green)]"
      style={{
        transformOrigin: "center",
      }}
      animate={
        reduced
          ? { rotate: angle }
          : { rotate: [angle, angle + 360] }
      }
      transition={reduced ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: "linear" }}
    >
      <div style={{ transform: `translateX(${radius}px)` }}>
        <svg viewBox="0 0 24 24" className="h-8 w-8" style={{ transform: `rotate(${-angle}deg)` }}>
          {GLYPHS[index % GLYPHS.length]}
        </svg>
      </div>
    </motion.div>
  );
}

export function AuthSplitShell({ children }: { children: ReactNode }) {
  const m = useMotion();

  return (
    <div className="landing-dark flex min-h-screen w-full bg-[var(--lp-bg)]">
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden lg:flex">
        {/* Ripple rings, low opacity, centered behind the logo. */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-[var(--lp-green)]"
            style={{ width: 160, height: 160 }}
            animate={
              m.prefersReduced
                ? { opacity: 0.08 }
                : { scale: [1, 2.6], opacity: [0.24, 0] }
            }
            transition={
              m.prefersReduced
                ? { duration: 0 }
                : { duration: 4, repeat: Infinity, delay: i * 1.3, ease: "easeOut" }
            }
          />
        ))}

        <div className="relative flex h-56 w-56 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <OrbitingGlyph key={i} index={i} total={3} reduced={m.prefersReduced} />
          ))}
          <motion.div
            animate={m.prefersReduced ? {} : { rotate: [0, 6, -6, 0] }}
            transition={m.prefersReduced ? { duration: 0 } : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            <StampdLogo size={72} tile />
          </motion.div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
