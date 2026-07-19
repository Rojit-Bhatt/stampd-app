import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Buttons are ACTION, so the default reads --primary (the value green), never
// --brand. An outlet's identity colour doesn't get to decide what a button
// looks like — see lib/color.ts for the full contract.
//
// 44px minimum height on the default size: this is a counter tool used
// one-handed on a phone, and 36px stock shadcn targets are too small for it.
// `sm` stays compact for dense admin tables.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-btn)] text-sm font-bold cursor-pointer transition-[color,background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-white hover:bg-[var(--primary-deep)]",
        destructive: "bg-[var(--err)] text-white hover:brightness-110",
        outline:
          "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--primary)] hover:text-[var(--primary-deep)]",
        secondary:
          "bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--line)]",
        ghost: "text-[var(--ink)] hover:bg-[var(--surface-2)]",
        link: "text-[var(--primary-deep)] underline-offset-4 hover:underline",
        // Identity, not action — for the rare control that belongs to the
        // outlet's brand rather than to the loyalty system.
        brand: "bg-[var(--brand)] text-[var(--brand-on)] hover:brightness-110",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-[var(--radius-field)] px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9 rounded-[var(--radius-field)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
