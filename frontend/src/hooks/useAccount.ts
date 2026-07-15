import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: "customer" | "business_admin" | "platform";
  emailVerified: boolean;
}

type Role = "admin" | "customer" | "platform";

export function useAccount(role: Role) {
  return useQuery<Account>({
    queryKey: ["account", role],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean } & Account>("/api/account/me", { role });
      return res;
    },
  });
}

export function useUpdateProfile(role: Role) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      apiRequest<{ success: boolean } & Account>("/api/account/profile", {
        method: "PATCH",
        role,
        body: { name },
      }),
    onSuccess: (account) => {
      qc.setQueryData(["account", role], account);
    },
  });
}

export function useChangePassword(role: Role) {
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) =>
      apiRequest<{ success: boolean; message: string }>("/api/account/change-password", {
        method: "POST",
        role,
        body,
      }),
  });
}
