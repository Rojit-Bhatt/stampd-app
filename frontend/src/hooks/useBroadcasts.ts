import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";

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

export function useBroadcastMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminBroadcasts"] });
  const invalidateDetail = (id: string) => qc.invalidateQueries({ queryKey: ["adminBroadcastDetail", id] });

  const create = useMutation({
    mutationFn: (draft: BroadcastDraft) =>
      apiRequest<{ success: boolean; broadcast: Broadcast }>("/api/admin/broadcasts", {
        method: "POST", role: "admin", body: draft,
      }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Broadcast, "active" | "subject" | "body">> }) =>
      apiRequest<{ success: boolean; broadcast: Broadcast }>(`/api/admin/broadcasts/${id}`, {
        method: "PATCH", role: "admin", body: patch,
      }),
    onSuccess: (_data, variables) => {
      invalidate();
      invalidateDetail(variables.id);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/broadcasts/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
