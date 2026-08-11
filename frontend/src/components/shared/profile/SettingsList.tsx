import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Red-tinted row — this app's one case is "Delete account". */
  danger?: boolean;
  content: ReactNode;
}

function rowClass(section: SettingsSection, isActive: boolean) {
  const base =
    "flex w-full items-center gap-3 rounded-[var(--radius-btn)] px-3.5 py-3 text-[13.5px] font-semibold transition-colors text-left";
  if (section.danger) {
    const activeCls = isActive ? "md:bg-red-50 md:text-red-600 dark:md:bg-red-950/30 dark:md:text-red-400" : "";
    return `${base} text-red-500/80 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 ${activeCls}`;
  }
  const activeCls = isActive ? "md:bg-[var(--primary-soft)] md:text-[var(--primary-deep)]" : "";
  return `${base} text-[var(--ink)] hover:bg-[var(--surface-2)] ${activeCls}`;
}

/**
 * WhatsApp/Telegram-style settings list: a row per section. On mobile,
 * tapping a row drills into a full-width sub-screen with a back row; on
 * desktop there's room for both, so the list stays visible on the left
 * and the content pane on the right shows the selected section (falling
 * back to the first section before anything's been clicked).
 *
 * `activeId` only tracks "what mobile is drilled into" — the desktop
 * pane derives its own fallback from `sections[0]` so first paint on a
 * wide screen isn't an empty "pick something" state.
 */
export function SettingsList({ sections }: { sections: SettingsSection[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const desktopActive = sections.find((s) => s.id === activeId) ?? sections[0] ?? null;

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <nav
        className={`flex-col gap-1 md:flex md:w-[240px] md:flex-shrink-0 ${
          activeId ? "hidden md:flex" : "flex"
        }`}
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveId(section.id)}
            className={rowClass(section, desktopActive?.id === section.id)}
          >
            <section.icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{section.label}</span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--muted)] md:hidden" />
          </button>
        ))}
      </nav>

      <div
        className={`min-w-0 flex-1 flex-col md:flex ${activeId ? "flex" : "hidden md:flex"}`}
      >
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)] md:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
          Settings
        </button>
        <div className="mb-3 hidden text-sm font-bold md:block">{desktopActive?.label}</div>
        {desktopActive?.content}
      </div>
    </div>
  );
}
