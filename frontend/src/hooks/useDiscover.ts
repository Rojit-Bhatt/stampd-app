import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { BusinessCategory } from "./useAdminSettings";

export interface DiscoverBusiness {
  id: string;
  slug: string;
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
