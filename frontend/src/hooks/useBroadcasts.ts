import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";
import toast from "../lib/toast";

export const TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum"] as const;
export type TierLabel = (typeof TIER_LABELS)[number];

export interface Broadcast {
  id: string;
  channel: "email" | "push" | "sms";
  segmentType: "tier" | "all";
  segmentTier: TierLabel | null;
  subject: string;
  body: string;
  active: boolean;
  createdAt: string;
  sentCount: number;
  failedCount: number;
  noConsentCount: number;
}

export interface BroadcastRecipient {
  userId: string;
  name: string;
  email: string;
  status: "sent" | "failed" | "no_consent" | "cap_reached";
  sentAt: string;
}

export interface BroadcastDetail extends Broadcast {
  recipients: BroadcastRecipient[];
}

export interface BroadcastDraft {
  channel: "email" | "push" | "sms";
  segmentType: "tier" | "all";
  segmentTier: TierLabel | null;
  subject: string;
  body: string;
}

export function useBroadcasts() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<Broadcast[]>({
    queryKey: ["adminBroadcasts", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: Broadcast[] }>("/api/admin/broadcasts", {
        role: "admin",
      });
      return res.data || [];
    },
  });
}

export function useBroadcastDetail(id: string | null) {
  return useQuery<BroadcastDetail | null>({
    queryKey: ["adminBroadcastDetail", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await apiRequest<{ success: boolean; data: BroadcastDetail }>(`/api/admin/broadcasts/${id}`, {
        role: "admin",
      });
      return res.data;
    },
    enabled: Boolean(id),
  });
}

// Keys whose broadcast data may live in cache — the list query is scoped by
// orgId, but optimistically-mutating both variants keeps the toggle instant
// no matter which one is currently cached.
const BROADCAST_KEYS: QueryKey[] = [
  ["adminBroadcasts"],
];

async function optimisticBroadcasts(
  qc: ReturnType<typeof useQueryClient>,
  fn: (old: unknown) => unknown
): Promise<Map<string, unknown>> {
  const snapshots = new Map<string, unknown>();
  for (const k of BROADCAST_KEYS) {
    const prev = qc.getQueryData(k);
    if (prev !== undefined) snapshots.set(JSON.stringify(k), prev);
  }
  await Promise.all(BROADCAST_KEYS.map((k) => qc.cancelQueries({ queryKey: k })));
  for (const k of BROADCAST_KEYS) {
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

export function useBroadcastMutations() {
  const qc = useQueryClient();
  const reconcile = (id?: string) => {
    for (const k of BROADCAST_KEYS) qc.invalidateQueries({ queryKey: k });
    if (id) qc.invalidateQueries({ queryKey: ["adminBroadcastDetail", id] });
  };
  type BroadcastPayload = { success: boolean; broadcast: Broadcast };

  // Optimistic: the list flips/create/deletes instantly; on failure the cache
  // rolls back to the snapshot and a visible toast explains the restore.
  const create = useMutation<BroadcastPayload, Error, BroadcastDraft>({
    mutationFn: (draft: BroadcastDraft) =>
      apiRequest<{ success: boolean; broadcast: Broadcast }>("/api/admin/broadcasts", {
        method: "POST", role: "admin", body: draft,
      }),
    onMutate: async (draft) => {
      const seeded: Broadcast = {
        id: `optimistic-${Date.now()}`,
        channel: draft.channel,
        segmentType: draft.segmentType,
        segmentTier: draft.segmentTier,
        subject: draft.subject,
        body: draft.body,
        active: true,
        createdAt: new Date().toISOString(),
        sentCount: 0,
        failedCount: 0,
        noConsentCount: 0,
      } as Broadcast;
      return optimisticBroadcasts(qc, (old) =>
        Array.isArray(old) ? [...old, seeded] : old
      );
    },
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("Your broadcast could not be created — restored.", { duration: 6000 });
    },
    onSettled: () => reconcile(),
  });

  const update = useMutation<BroadcastPayload, Error, { id: string; patch: Partial<Pick<Broadcast, "active" | "subject" | "body">> }>({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Broadcast, "active" | "subject" | "body">> }) =>
      apiRequest<{ success: boolean; broadcast: Broadcast }>(`/api/admin/broadcasts/${id}`, {
        method: "PATCH", role: "admin", body: patch,
      }),
    onMutate: async ({ id, patch }) =>
      optimisticBroadcasts(qc, (old) =>
        Array.isArray(old)
          ? old.map((b: Broadcast) => (b.id === id ? { ...b, ...patch } : b))
          : old
      ),
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("Your broadcast could not be saved — restored.", { duration: 6000 });
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.id) reconcile(variables.id);
    },
  });

  const remove = useMutation<unknown, Error, string>({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/broadcasts/${id}`, { method: "DELETE", role: "admin" }),
    onMutate: async (id) =>
      optimisticBroadcasts(qc, (old) =>
        Array.isArray(old)
          ? old.filter((b: Broadcast) => b.id !== id)
          : old
      ),
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("Your broadcast could not be deleted — restored.", { duration: 6000 });
    },
    onSettled: () => reconcile(),
  });

  return { create, update, remove };
}
