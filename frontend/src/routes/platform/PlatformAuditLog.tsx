import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";

interface AuditEntry {
  id: string;
  actorName: string;
  action: "onboard" | "edit" | "suspend" | "reactivate" | "invite_admin" | "remove_admin";
  targetName: string;
  details: string;
  createdAt: string;
}

const ACTION_LABELS: Record<AuditEntry["action"], string> = {
  onboard: "Onboarded",
  edit: "Edited",
  suspend: "Suspended",
  reactivate: "Reactivated",
  invite_admin: "Admin invited",
  remove_admin: "Admin removed",
};

const ACTION_COLORS: Record<AuditEntry["action"], { bg: string; fg: string }> = {
  onboard: { bg: "var(--primary-soft)", fg: "var(--plat)" },
  edit: { bg: "var(--line)", fg: "var(--soft)" },
  suspend: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  reactivate: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  invite_admin: { bg: "var(--primary-soft)", fg: "var(--plat)" },
  remove_admin: { bg: "var(--warn-soft)", fg: "var(--warn)" },
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PlatformAuditLog() {
  const { data: entries = [], isLoading } = useQuery<AuditEntry[]>({
    queryKey: ["platformAuditLog"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; entries: AuditEntry[] }>(
        "/api/platform/audit-log",
        { role: "platform" },
      );
      return res.entries || [];
    },
  });

  return (
    <div>
      <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Activity log</h1>
      <p className="mb-6 text-[var(--muted)]">Every business and team action, most recent first.</p>

      <div className="shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="grid grid-cols-[140px_110px_1fr_1.5fr] border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>When</span>
          <span>Action</span>
          <span>Business</span>
          <span>Details</span>
        </div>

        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[140px_110px_1fr_1.5fr] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          ))
        ) : entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">
            No activity yet.
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="grid grid-cols-[140px_110px_1fr_1.5fr] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 text-sm last:border-b-0">
              <span className="text-[var(--muted)]">{formatWhen(e.createdAt)}</span>
              <span>
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{ background: ACTION_COLORS[e.action].bg, color: ACTION_COLORS[e.action].fg }}
                >
                  {ACTION_LABELS[e.action]}
                </span>
              </span>
              <span className="font-semibold">{e.targetName}</span>
              <span className="text-[var(--muted)]">
                {e.details || "—"} <span className="text-[var(--soft)]">· {e.actorName}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
