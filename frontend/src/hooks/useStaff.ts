import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";
import toast from "../lib/toast";

export interface StaffMember {
  /** The User membership id — what performedByUserId records on the ledger. */
  id: string;
  name: string;
  email: string;
  /** null = the outlet's primary admin, full access. */
  staffRole: "manager" | "staff" | null;
  emailVerified: boolean;
  /** The hash itself is never returned in any shape — this is the only signal. */
  hasPin: boolean;
  isPrimary: boolean;
  isSelf: boolean;
}

export interface StaffInviteDraft {
  name: string;
  email: string;
  staffRole: "manager" | "staff";
  password: string;
  pin: string;
}

export function useStaff() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<{ staff: StaffMember[]; pinRequired: boolean }>({
    queryKey: ["adminStaff", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; staff: StaffMember[]; pinRequired: boolean }>(
        "/api/admin/staff",
        { role: "admin" },
      );
      return { staff: res.staff || [], pinRequired: res.pinRequired };
    },
  });
}

// Keys whose staff list may live in cache — the query is scoped by orgId,
// but optimistically-mutating both variants keeps the toggle instant no
// matter which one is currently cached. adminSettings carries pinRequired,
// which stashes but never mutates (no list shape there).
const STAFF_KEYS: QueryKey[] = [["adminStaff"]];
const STAFF_RECONCILE_KEYS: QueryKey[] = [["adminStaff"], ["adminSettings"]];

async function optimisticStaff(
  qc: ReturnType<typeof useQueryClient>,
  fn: (old: unknown) => unknown
): Promise<Map<string, unknown>> {
  const snapshots = new Map<string, unknown>();
  for (const k of STAFF_KEYS) {
    const prev = qc.getQueryData(k);
    if (prev !== undefined) snapshots.set(JSON.stringify(k), prev);
  }
  await Promise.all(STAFF_KEYS.map((k) => qc.cancelQueries({ queryKey: k })));
  for (const k of STAFF_KEYS) {
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

function reconcileStaff(qc: ReturnType<typeof useQueryClient>): void {
  for (const k of STAFF_RECONCILE_KEYS) qc.invalidateQueries({ queryKey: k });
}

export function useInviteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: StaffInviteDraft) =>
      apiRequest<{ success: boolean } & StaffMember>("/api/admin/staff", {
        method: "POST",
        role: "admin",
        body: draft,
      }),
    onMutate: async (draft) => {
      const seeded: StaffMember = {
        id: `optimistic-${Date.now()}`,
        name: draft.name,
        email: draft.email,
        staffRole: draft.staffRole,
        emailVerified: false,
        hasPin: Boolean(draft.pin),
        isPrimary: false,
        isSelf: false,
      } as StaffMember;
      return optimisticStaff(qc, (old) =>
        old && typeof old === "object" && Array.isArray((old as { staff: unknown }).staff)
          ? { ...(old as { staff: StaffMember[]; pinRequired: boolean }), staff: [...(old as { staff: StaffMember[] }).staff, seeded] }
          : old
      );
    },
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("The staff invite could not be sent — restored.", { duration: 6000 });
    },
    onSettled: () => reconcileStaff(qc),
  });
}

export function useUpdateStaffRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, staffRole }: { id: string; staffRole: "manager" | "staff" }) =>
      apiRequest<{ success: boolean } & StaffMember>(`/api/admin/staff/${id}`, {
        method: "PATCH",
        role: "admin",
        body: { staffRole },
      }),
    onMutate: async ({ id, staffRole }) =>
      optimisticStaff(qc, (old) =>
        old && typeof old === "object" && Array.isArray((old as { staff: unknown }).staff)
          ? {
              ...(old as { staff: StaffMember[]; pinRequired: boolean }),
              staff: (old as { staff: StaffMember[] }).staff.map((m) => (m.id === id ? { ...m, staffRole } : m)),
            }
          : old
      ),
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("The role change could not be saved — restored.", { duration: 6000 });
    },
    onSettled: () => reconcileStaff(qc),
  });
}

export function useRemoveStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ success: boolean }>(`/api/admin/staff/${id}`, { method: "DELETE", role: "admin" }),
    onMutate: async (id) =>
      optimisticStaff(qc, (old) =>
        old && typeof old === "object" && Array.isArray((old as { staff: unknown }).staff)
          ? {
              ...(old as { staff: StaffMember[]; pinRequired: boolean }),
              staff: (old as { staff: StaffMember[] }).staff.filter((m) => m.id !== id),
            }
          : old
      ),
    onError: (_err, _vars, ctx) => {
      restoreSnapshots(qc, ctx);
      toast.error("The staff member could not be removed — restored.", { duration: 6000 });
    },
    onSettled: () => reconcileStaff(qc),
  });
}

// `id: "me"` is the self-service path — the one every staffRole (including
// "manager", which can't manage_staff) can always reach, so setting your own
// PIN is never blocked by the permission that gates managing everyone else's.
export function useSetStaffPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pin, currentPin }: { id: string; pin: string | null; currentPin?: string }) =>
      apiRequest<{ success: boolean } & Partial<StaffMember>>(`/api/admin/staff/${id}/pin`, {
        method: "PATCH",
        role: "admin",
        body: { pin, currentPin },
      }),
    onSuccess: () => reconcileStaff(qc),
  });
}
