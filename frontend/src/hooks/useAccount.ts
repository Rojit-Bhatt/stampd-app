import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, decodeJwtPayload } from "../lib/api";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: "customer" | "business_admin" | "platform";
  emailVerified: boolean;
  /** False for a Google-only signin that never set one. */
  hasPassword: boolean;
}

type Role = "admin" | "customer" | "platform";

const TOKEN_SLOT: Record<Role, string> = {
  admin: "admin_auth_token",
  customer: "customer_auth_token",
  platform: "platform_auth_token",
};

// /api/account/me returns the OUTLET MEMBERSHIP row, not the platform-wide
// account — so its cache entry belongs to one outlet, exactly like every
// query in usePoints.ts. Keyed on `["account", role]` alone it survived an
// outlet switch and kept serving the previous outlet's membership.
//
// The scope is taken from the JWT rather than from useTenant() because this
// hook is also called from platform pages, which render outside any
// TenantProvider (useTenant throws there). The JWT is also the more honest
// key: it is what the backend actually scopes the response by.
const accountQueryKey = (role: Role) => {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_SLOT[role]) : null;
  return ["account", role, token ? decodeJwtPayload(token)?.organizationId ?? null : null];
};

export function useAccount(role: Role) {
  return useQuery<Account>({
    queryKey: accountQueryKey(role),
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
      qc.setQueryData(accountQueryKey(role), account);
      if (typeof window !== "undefined") {
        if (role === "admin") {
          const stored = localStorage.getItem("admin_auth_user");
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              parsed.name = account.name;
              localStorage.setItem("admin_auth_user", JSON.stringify(parsed));
            } catch (_) {}
          }
        } else if (role === "customer") {
          const stored = localStorage.getItem("customer_auth_user");
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              parsed.name = account.name;
              localStorage.setItem("customer_auth_user", JSON.stringify(parsed));
            } catch (_) {}
          }
        }
      }
    },
  });
}

export function useChangePassword(role: Role) {
  return useMutation({
    mutationFn: async (body: { currentPassword?: string; newPassword: string }) =>
      apiRequest<{ success: boolean; message: string }>("/api/account/change-password", {
        method: "POST",
        role,
        body,
      }),
  });
}
