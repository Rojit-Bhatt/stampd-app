import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";

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

function useInvalidateStaff() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["adminStaff"] });
    // Inviting the first sub-staff (or clearing the last PIN) can flip
    // staffPinRequired, which lives on /settings, not /staff.
    qc.invalidateQueries({ queryKey: ["adminSettings"] });
  };
}

export function useInviteStaff() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: (draft: StaffInviteDraft) =>
      apiRequest<{ success: boolean } & StaffMember>("/api/admin/staff", {
        method: "POST",
        role: "admin",
        body: draft,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateStaffRole() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: ({ id, staffRole }: { id: string; staffRole: "manager" | "staff" }) =>
      apiRequest<{ success: boolean } & StaffMember>(`/api/admin/staff/${id}`, {
        method: "PATCH",
        role: "admin",
        body: { staffRole },
      }),
    onSuccess: invalidate,
  });
}

export function useRemoveStaff() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ success: boolean }>(`/api/admin/staff/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: invalidate,
  });
}

// `id: "me"` is the self-service path — the one every staffRole (including
// "manager", which can't manage_staff) can always reach, so setting your own
// PIN is never blocked by the permission that gates managing everyone else's.
export function useSetStaffPin() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: ({ id, pin, currentPin }: { id: string; pin: string | null; currentPin?: string }) =>
      apiRequest<{ success: boolean } & Partial<StaffMember>>(`/api/admin/staff/${id}/pin`, {
        method: "PATCH",
        role: "admin",
        body: { pin, currentPin },
      }),
    onSuccess: invalidate,
  });
}
