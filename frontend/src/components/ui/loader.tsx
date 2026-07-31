import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { useMotion } from "../../lib/motion";

interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_CONFIG = {
  sm: {
    container: "size-20",
    titleClass: "text-sm/tight font-medium",
    subtitleClass: "text-xs/relaxed",
    spacing: "space-y-2",
    maxWidth: "max-w-48",
  },
  md: {
    container: "size-32",
    titleClass: "text-base/snug font-medium",
    subtitleClass: "text-sm/relaxed",
    spacing: "space-y-3",
    maxWidth: "max-w-56",
  },
  lg: {
    container: "size-40",
    titleClass: "text-lg/tight font-semibold",
    subtitleClass: "text-base/relaxed",
    spacing: "space-y-4",
    maxWidth: "max-w-64",
  },
} as const;

export function Loader({
  title = "One moment",
  subtitle = "Getting things ready",
  size = "md",
  className,
  ...props
}: LoaderProps) {
  const m = useMotion();
  const config = SIZE_CONFIG[size];

  const spin = (duration: number) =>
    m.prefersReduced ? { duration: 0 } : { duration, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };
  const spinEase = (duration: number) =>
    m.prefersReduced
      ? { duration: 0 }
      : { duration, repeat: Number.POSITIVE_INFINITY, ease: [0.4, 0, 0.6, 1] as const };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-8 p-8", className)} {...props}>
      <motion.div
        animate={m.pick({ scale: [1, 1.02, 1] }, { scale: 1 })}
        className={cn("relative", config.container)}
        transition={spinEase(4)}
      >
        {/* Outer ring with shimmer */}
        <motion.div
          animate={m.pick({ rotate: [0, 360] }, { rotate: 0 })}
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, transparent 0deg, var(--primary) 90deg, transparent 180deg)",
            mask: "radial-gradient(circle at 50% 50%, transparent 35%, black 37%, black 39%, transparent 41%)",
            WebkitMask:
              "radial-gradient(circle at 50% 50%, transparent 35%, black 37%, black 39%, transparent 41%)",
            opacity: 0.8,
          }}
          transition={spin(3)}
        />

        {/* Primary ring */}
        <motion.div
          animate={m.pick({ rotate: [0, 360] }, { rotate: 0 })}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, var(--primary) 120deg, color-mix(in srgb, var(--primary) 50%, transparent) 240deg, transparent 360deg)",
            mask: "radial-gradient(circle at 50% 50%, transparent 42%, black 44%, black 48%, transparent 50%)",
            WebkitMask:
              "radial-gradient(circle at 50% 50%, transparent 42%, black 44%, black 48%, transparent 50%)",
            opacity: 0.9,
          }}
          transition={spinEase(2.5)}
        />

        {/* Secondary ring, counter rotation */}
        <motion.div
          animate={m.pick({ rotate: [0, -360] }, { rotate: 0 })}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 180deg, transparent 0deg, color-mix(in srgb, var(--primary) 60%, transparent) 45deg, transparent 90deg)",
            mask: "radial-gradient(circle at 50% 50%, transparent 52%, black 54%, black 56%, transparent 58%)",
            WebkitMask:
              "radial-gradient(circle at 50% 50%, transparent 52%, black 54%, black 56%, transparent 58%)",
            opacity: 0.35,
          }}
          transition={spinEase(4)}
        />

        {/* Accent particles */}
        <motion.div
          animate={m.pick({ rotate: [0, 360] }, { rotate: 0 })}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 270deg, transparent 0deg, color-mix(in srgb, var(--primary) 40%, transparent) 20deg, transparent 40deg)",
            mask: "radial-gradient(circle at 50% 50%, transparent 61%, black 62%, black 63%, transparent 64%)",
            WebkitMask:
              "radial-gradient(circle at 50% 50%, transparent 61%, black 62%, black 63%, transparent 64%)",
            opacity: 0.5,
          }}
          transition={spin(3.5)}
        />
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className={cn("text-center", config.spacing, config.maxWidth)}
        initial={m.pick({ opacity: 0, y: 12 }, false)}
        transition={m.prefersReduced ? { duration: 0 } : { delay: 0.4, duration: 1, ease: [0.4, 0, 0.2, 1] }}
      >
        <h1
          className={cn(config.titleClass, "font-medium text-[var(--ink)] leading-[1.15] tracking-[-0.02em]")}
        >
          {title}
        </h1>
        <p
          className={cn(
            config.subtitleClass,
            "mt-1 font-normal text-[var(--muted)] leading-[1.45] tracking-[-0.01em]",
          )}
        >
          {subtitle}
        </p>
      </motion.div>
    </div>
  );
}
