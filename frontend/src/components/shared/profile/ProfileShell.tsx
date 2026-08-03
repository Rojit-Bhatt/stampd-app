import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface ProfileSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Red-tinted link — this app's one case is "Delete account". */
  danger?: boolean;
  content: ReactNode;
}

/**
 * A Clerk <UserProfile>-style shell: a rail of section links, one section's
 * content shown at a time. Takes sections as data, the same convention
 * SettingsTabs.tsx already uses for its own tabs — so a later profile
 * surface can add a section without touching this file.
 *
 * Below md, the rail becomes a horizontal scrollable strip above the
 * content, mirroring how AdminLayout's own nav rail collapses to a drawer
 * on a narrow screen — this app's established answer to "no room for a
 * fixed side rail," just horizontal since a profile page has no need for
 * the drawer's overlay behavior.
 */
export function ProfileShell({ sections }: { sections: ProfileSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  const linkClass = (section: ProfileSection) => {
    const isActive = section.id === activeId;
    const base = "flex items-center gap-3 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors whitespace-nowrap";
    if (section.danger) {
      return `${base} ${isActive ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400" : "text-red-500/80 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"}`;
    }
    return `${base} ${isActive ? "bg-[var(--primary-soft)] text-[var(--primary-deep)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`;
  };

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <nav className="flex flex-shrink-0 gap-1 overflow-x-auto pb-1 md:w-[200px] md:flex-col md:overflow-visible md:pb-0">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveId(section.id)}
            className={linkClass(section)}
          >
            <section.icon className="h-4 w-4 flex-shrink-0" />
            {section.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">{active?.content}</div>
    </div>
  );
}
