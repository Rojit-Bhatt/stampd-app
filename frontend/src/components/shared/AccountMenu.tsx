import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Settings, LogOut } from "lucide-react";

interface AccountMenuProps {
  initial: string;
  name: string;
  email?: string;
  settingsPath: string;
  onLogout: () => void;
  accent?: string;
  dropUp?: boolean;
}

export function AccountMenu({ initial, name, email, settingsPath, onLogout, accent, dropUp }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-[11px] px-2 py-2 text-left transition-colors hover:bg-[var(--bg)]"
      >
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] font-display text-sm font-extrabold text-white"
          style={{ background: accent || "var(--brand)" }}
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold">{name}</span>
          {email && <span className="block truncate text-[11px] text-[var(--soft)]">{email}</span>}
        </span>
      </button>

      {open && (
        <div
          className={`absolute left-0 z-10 w-full min-w-[180px] overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface)] shadow-lg ${
            dropUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <Link
            to={settingsPath}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg)]"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-[var(--muted)] hover:bg-[var(--bg)]"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
