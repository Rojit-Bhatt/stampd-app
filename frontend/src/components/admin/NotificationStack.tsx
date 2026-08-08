import { useRef } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../lib/api";
import { CardStack } from "../ui/CardStack";

interface NotificationItem {
  id: string;
  type: "redemption" | "new_customer";
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const MARK_READ_DWELL_MS = 2000;
const MAX_SHOWN = 7;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Same calendar day as "now", in the browser's local time zone — good enough
// for a single-outlet console where staff and customer share a timezone.
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Fixed top-right, above the dashboard content — collapsed to an icon+count
// pill, expands DOWNWARD into today's notifications (last 7), motion.dev
// js-notifications-stack pattern via CardStack. Replaces the old navbar bell
// (components/admin/NotificationBell.tsx, dropped) — this is a page widget,
// not chrome.
export function NotificationStack() {
  const queryClient = useQueryClient();
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["admin-notifications"],
    queryFn: () => apiRequest<NotificationsResponse>("/api/admin/notifications"),
    refetchInterval: 30_000,
  });

  const todays = (data?.notifications ?? []).filter((n) => isToday(n.createdAt)).slice(0, MAX_SHOWN);
  const unreadCount = todays.filter((n) => !n.readAt).length;

  const markAllRead = async () => {
    await apiRequest("/api/admin/notifications/read-all", { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  };

  return (
    <CardStack
      className="z-30"
      isEmpty={todays.length === 0}
      empty="No notifications today."
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={() => {
            // Opening counts as reading, after a short dwell — same behaviour
            // the old bell had. Fired on the open transition only, not on
            // every toggle.
            if (!open && unreadCount > 0) {
              if (dwellTimer.current) clearTimeout(dwellTimer.current);
              dwellTimer.current = setTimeout(markAllRead, MARK_READ_DWELL_MS);
            }
            toggle();
          }}
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications today` : "Notifications"}
          className="relative flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-bold text-[var(--ink)] shadow-ambient transition-colors hover:bg-[var(--surface-2)]"
        >
          <Bell className="h-4 w-4" />
          {todays.length > 0 && <span>{todays.length}</span>}
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-red-500" />
          )}
        </button>
      )}
    >
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--soft)]">
          Today
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-[11px] font-semibold text-[var(--primary-deep)] hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>
      {todays.map((n) => (
        <div
          key={n.id}
          className={`flex flex-col gap-0.5 px-3 py-2 ${!n.readAt ? "bg-[var(--primary-soft)]" : ""}`}
        >
          <span className="text-[13px] text-[var(--ink)]">{n.message}</span>
          <span className="text-[11px] text-[var(--soft)]">{relativeTime(n.createdAt)}</span>
        </div>
      ))}
    </CardStack>
  );
}
