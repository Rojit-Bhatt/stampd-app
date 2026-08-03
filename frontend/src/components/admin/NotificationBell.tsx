import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../lib/api";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";

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

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["admin-notifications"],
    queryFn: () => apiRequest<NotificationsResponse>("/api/admin/notifications"),
    refetchInterval: 30_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markAllRead = async () => {
    await apiRequest("/api/admin/notifications/read-all", { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  };

  // Opening the panel counts as reading it, after a short dwell — matching
  // how a notification bell conventionally behaves, rather than requiring a
  // click per item. "Mark all read" stays available for clearing without
  // opening at all.
  useEffect(() => {
    if (open && unreadCount > 0) {
      dwellTimer.current = setTimeout(markAllRead, MARK_READ_DWELL_MS);
    }
    return () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-[280px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--soft)]">
            Notifications
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

        {notifications.length === 0 ? (
          <div className="px-2 py-4 text-center text-[13px] text-[var(--muted)]">
            Nothing yet.
          </div>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem key={n.id} className={!n.readAt ? "bg-[var(--primary-soft)]" : undefined}>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px]">{n.message}</span>
                <span className="text-[11px] text-[var(--soft)]">{relativeTime(n.createdAt)}</span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
