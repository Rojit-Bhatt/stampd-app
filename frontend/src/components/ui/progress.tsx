import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

// Two jobs, deliberately different colours:
//   `value`  progress toward something good — the next affordable reward.
//   `time`   a countdown that turns amber then red — days left on a
//            subscription. Urgency without alarm until it's actually urgent.
//
// The bar is a presentation of a number that already exists elsewhere on
// screen; it never carries the only copy of the value.

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number | null;
  tone?: "value" | "time";
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, tone = "value", ...props }, ref) => {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const fill =
    tone === "value"
      ? "var(--primary)"
      : pct <= 15
        ? "var(--err)"
        : pct <= 40
          ? "var(--warn)"
          : "var(--primary)";

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={pct}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ backgroundColor: fill, transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
