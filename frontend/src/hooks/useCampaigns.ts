import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";

export interface Campaign {
  id: string;
  name: string;
  description: string;
  /** What a bill earns while this is live. 2 = double points. */
  multiplier: number;
  startAt: string;
  /** Null = runs until switched off. */
  endAt: string | null;
  /** 0=Sunday..6=Saturday, judged in the platform's timezone. Empty = every day. */
  daysOfWeek: number[];
  /** The admin's switch. */
  isActive: boolean;
  /** Derived server-side: whether it is actually multiplying anything RIGHT NOW. */
  isLive: boolean;
}

export interface CampaignDraft {
  name: string;
  description: string;
  multiplier: number;
  startAt: string;
  endAt: string | null;
  daysOfWeek: number[];
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function useCampaigns() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<Campaign[]>({
    queryKey: ["adminCampaigns", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: Campaign[] }>("/api/admin/campaigns", {
        role: "admin",
      });
      return res.data || [];
    },
  });
}

export function useCampaignMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["adminCampaigns"] });
    // A campaign changes what the next bill is worth, so the QR preview and
    // the dashboard both go stale the moment one is touched.
    qc.invalidateQueries({ queryKey: ["adminDashboardStats"] });
  };

  const create = useMutation({
    mutationFn: (draft: CampaignDraft) =>
      apiRequest<{ success: boolean; campaign: Campaign }>("/api/admin/campaigns", {
        method: "POST", role: "admin", body: draft,
      }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CampaignDraft> & { isActive?: boolean } }) =>
      apiRequest<{ success: boolean; campaign: Campaign }>(`/api/admin/campaigns/${id}`, {
        method: "PATCH", role: "admin", body: patch,
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/campaigns/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

// "2x", "1.5x" — never "2.0x".
export function formatMultiplier(m: number): string {
  return `${Number.isInteger(m) ? m : Number(m.toFixed(2))}x`;
}

export function describeSchedule(c: Pick<Campaign, "daysOfWeek" | "startAt" | "endAt">): string {
  const days =
    c.daysOfWeek.length === 0
      ? "Every day"
      : c.daysOfWeek.length === 7
        ? "Every day"
        : c.daysOfWeek
            .slice()
            .sort((a, b) => a - b)
            .map((d) => DAY_LABELS[d])
            .join(", ");

  const from = new Date(c.startAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const to = c.endAt
    ? new Date(c.endAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return to ? `${days} · ${from} – ${to}` : `${days} · from ${from}`;
}
