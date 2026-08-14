import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";
import toast from "../lib/toast";

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

// Keys whose campaign list may live in cache — the query is scoped by orgId,
// but optimistically-mutating both variants keeps the toggle instant no
// matter which one is currently cached.
const CAMPAIGN_KEYS: QueryKey[] = [
  ["adminCampaigns"],
  ["adminDashboardStats"],
];

// Apply `fn` optimistically to every campaign list in cache, stashing
// snapshots first so a failure can restore the exact prior state.
async function optimisticCampaigns(
  qc: ReturnType<typeof useQueryClient>,
  fn: (old: unknown) => unknown
): Promise<Map<string, unknown>> {
  const snapshots = new Map<string, unknown>();
  for (const k of CAMPAIGN_KEYS) {
    const prev = qc.getQueryData(k);
    if (prev !== undefined) snapshots.set(JSON.stringify(k), prev);
  }
  await Promise.all(CAMPAIGN_KEYS.map((k) => qc.cancelQueries({ queryKey: k })));
  for (const k of CAMPAIGN_KEYS) {
    qc.setQueryData(k, (old: unknown) => fn(old));
  }
  return snapshots;
}

function restoreSnapshots(
  qc: ReturnType<typeof useQueryClient>,
  snapshots: unknown
): void {
  if (!snapshots || !(snapshots instanceof Map)) return;
  for (const [keyStr, prev] of snapshots as Map<string, unknown>) {
    qc.setQueryData(JSON.parse(keyStr), prev);
  }
}

export function useCampaignMutations() {
  const qc = useQueryClient();
  const reconcile = () => {
    // A campaign changes what the next bill is worth, so the QR preview and
    // the dashboard both go stale the moment one is touched.
    for (const k of CAMPAIGN_KEYS) qc.invalidateQueries({ queryKey: k });
  };

  // Optimistic: the UI flips/create/deletes instantly; on failure the cache
  // rolls back to the snapshot and a visible toast explains the restore so
  // the admin is never misled about what is saved.
  const create = useMutation({
    mutationFn: (draft: CampaignDraft) =>
      apiRequest<{ success: boolean; campaign: Campaign }>("/api/admin/campaigns", {
        method: "POST", role: "admin", body: draft,
      }),
    onMutate: async (draft) => {
      const seeded: Campaign = {
        id: `optimistic-${Date.now()}`,
        name: draft.name,
        description: draft.description,
        multiplier: draft.multiplier,
        startAt: draft.startAt,
        endAt: draft.endAt,
        daysOfWeek: draft.daysOfWeek,
        isActive: true,
        isLive: false,
      } as Campaign;
      return optimisticCampaigns(qc, (old) =>
        Array.isArray(old) ? [...old, seeded] : old
      );
    },
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("Your campaign could not be created — restored.", { duration: 6000 });
    },
    onSettled: reconcile,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CampaignDraft> & { isActive?: boolean } }) =>
      apiRequest<{ success: boolean; campaign: Campaign }>(`/api/admin/campaigns/${id}`, {
        method: "PATCH", role: "admin", body: patch,
      }),
    onMutate: async ({ id, patch }) =>
      optimisticCampaigns(qc, (old) =>
        Array.isArray(old)
          ? old.map((c: Campaign) => (c.id === id ? { ...c, ...patch } : c))
          : old
      ),
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("Your campaign could not be saved — restored.", { duration: 6000 });
    },
    onSettled: reconcile,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/campaigns/${id}`, { method: "DELETE", role: "admin" }),
    onMutate: async (id) =>
      optimisticCampaigns(qc, (old) =>
        Array.isArray(old)
          ? old.filter((c: Campaign) => c.id !== id)
          : old
      ),
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("Your campaign could not be deleted — restored.", { duration: 6000 });
    },
    onSettled: reconcile,
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
