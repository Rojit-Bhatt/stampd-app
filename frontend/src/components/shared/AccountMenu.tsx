import { Link } from "react-router-dom";
import { Settings, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";

interface AccountMenuProps {
  initial: string;
  name: string;
  /** Hide the name/email below xl — for horizontal bars where space is tight. */
  compact?: boolean;
  email?: string;
  /** Omit to hide the Settings item entirely — a "staff"-role outlet admin
   *  never reaches Settings; every route behind it 403s. */
  settingsPath?: string;
  onLogout: () => void;
  accent?: string;
  dropUp?: boolean;
}

export function AccountMenu({ initial, name, email, settingsPath, onLogout, accent, dropUp, compact }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-[var(--radius-btn)] px-2 py-2 text-left transition-colors hover:bg-[var(--bg)]">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] font-display text-sm font-bold text-white"
            style={{ background: accent || "var(--brand)" }}
          >
            {initial}
          </span>
          <span className={`min-w-0 flex-1 ${compact ? "hidden xl:block" : ""}`}>
            <span className="block truncate text-[13px] font-bold">{name}</span>
            {email && <span className="block truncate text-[11px] text-[var(--soft)]">{email}</span>}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side={dropUp ? "top" : "bottom"} align="start" className="w-[220px]">
        {settingsPath && (
          <DropdownMenuItem asChild>
            <Link to={settingsPath} className="cursor-pointer">
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem destructive onClick={onLogout}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
