import * as React from "react";

import { cn } from "@/lib/utils";

// Subtle fill at rest, green focus ring. 44px tall for the same reason the
// button is: bill entry happens on a phone at a counter.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-base text-[var(--ink)] transition-colors",
          "placeholder:text-[var(--soft)]",
          "focus-visible:border-[var(--primary)] focus-visible:bg-[var(--bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-[var(--err)] aria-[invalid=true]:ring-[var(--err)]/25",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
