import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { BusinessCategory } from "./useAdminSettings";

export interface DiscoverBusiness {
  id: string;
  /** The OUTLET slug. Unique only within its company — never a path on its own. */
  slug: string;
  /**
   * The owning company's slug. Required to link anywhere: an outlet slug alone
   * cannot identify an outlet, so every tenant URL needs both segments. The
   * API has always sent this; the type used to omit it, which is how the
   * Discover cards ended up linking to a path that resolved to no tenant.
   */
  companySlug: string;
  name: string;
  category: BusinessCategory;
  branding: {
    bannerUrl: string;
    logoUrl: string;
    primaryColor: string;
  };
  contact: {
    latitude: number | null;
    longitude: number | null;
  };
  program: {
    /** Percentage of the bill returned as points. 100 = 1 point per rupee. */
    earnPercent: number;
  };
  createdAt: string;
  /** Real points movements in the last 7 days — the trending signal. */
  recentActivityCount: number;
}

export function useDiscover() {
  return useQuery<DiscoverBusiness[]>({
    queryKey: ["discover"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; businesses: DiscoverBusiness[] }>(
        "/api/customer-auth/discover",
        { role: "customer-global" },
      );
      return res.businesses || [];
    },
  });
}
