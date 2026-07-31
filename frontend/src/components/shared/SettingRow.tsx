import type { ReactNode } from "react";

interface SettingRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

/**
 * One settings line: what it is on the left, the control hard right, a
 * hairline between rows. The description carries the meaning so the control
 * never has to be self-explanatory.
 */
export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] py-4 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-[var(--ink)]">{label}</div>
        {description && (
          <div className="mt-0.5 text-[13px] text-[var(--muted)]">{description}</div>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
