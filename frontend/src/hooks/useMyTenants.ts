import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface MyTenantMembership {
  organizationId: string;
  slug: string;
  /** Required to build /[company]/[outlet] — an outlet slug alone is ambiguous. */
  companySlug: string;
  name: string;
  branding: {
    logoUrl: string;
    bannerUrl: string;
    primaryColor: string;
  };
  /** This outlet's balance. Points never pool, so there is no total. */
  balance: number;
  earnPercent: number;
  expiresAt: string | null;
  lastActivityAt: string | null;
}

export function useMyTenants() {
  return useQuery<MyTenantMembership[]>({
    queryKey: ["myTenants"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; memberships: MyTenantMembership[] }>(
        "/api/customer-auth/my-tenants",
        { role: "customer-global" },
      );
      return res.memberships || [];
    },
  });
}
