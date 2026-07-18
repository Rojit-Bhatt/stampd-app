import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import { cn } from "@/lib/utils";

// A genuine either/or choice with both options visible at once: light/dark,
// and — the reason this exists — inherit/override on the outlet's points
// program.
//
// That second case is why this isn't a checkbox. Every field in
// Organization.program defaults to null meaning "inherit from the company",
// and 0 is a real configured value that means something entirely different.
// A control that can't show those as two distinct visible states invites
// exactly the mistake the program config can't afford.

// Typed off ToggleGroupSingleProps rather than the Root prop union: Omit over
// that union lets `defaultValue: string[]` through, which is nonsense for a
// single-select control.
export interface SegmentedControlProps
  extends Omit<ToggleGroupPrimitive.ToggleGroupSingleProps, "type" | "value" | "onValueChange"> {
  value: string;
  onValueChange: (value: string) => void;
}

const SegmentedControl = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  SegmentedControlProps
>(({ className, value, onValueChange, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    type="single"
    value={value}
    // Radix emits "" when the active item is pressed again. Swallow that:
    // a segmented control always has exactly one option selected.
    onValueChange={(v) => v && onValueChange(v)}
    className={cn(
      "inline-flex items-center gap-1 rounded-[var(--radius-btn)] bg-[var(--surface-2)] p-1",
      className,
    )}
    {...props}
  />
));
SegmentedControl.displayName = "SegmentedControl";

const SegmentedControlItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "inline-flex h-9 min-w-[84px] items-center justify-center gap-1.5 rounded-[var(--radius-field)] px-3 text-xs font-bold text-[var(--muted)] transition-colors",
      "hover:text-[var(--ink)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)]",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=on]:bg-[var(--surface)] data-[state=on]:text-[var(--ink)] data-[state=on]:shadow-ambient",
      className,
    )}
    {...props}
  />
));
SegmentedControlItem.displayName = "SegmentedControlItem";

export { SegmentedControl, SegmentedControlItem };
