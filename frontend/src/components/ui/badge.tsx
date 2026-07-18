import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Status pills. `live` is the loudest on purpose — it marks an active campaign
// multiplier, which changes what a bill is worth and has to be unmissable to
// both staff and customer at the moment of earning.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        live: "bg-[var(--primary)] text-white",
        active: "bg-[var(--ok-soft)] text-[var(--ok)]",
        pending: "bg-[var(--warn-soft)] text-[var(--warn)]",
        expired: "bg-[var(--err-soft)] text-[var(--err)]",
        neutral: "bg-[var(--surface-2)] text-[var(--muted)]",
        outline: "border border-[var(--line)] text-[var(--muted)]",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
