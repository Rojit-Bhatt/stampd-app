import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../lib/api";

export interface PublicPlan {
  slug: string;
  name: string;
  priceNpr: number;
  features: string[];
  isMostPopular: boolean;
}

/**
 * The marketing pricing section reads the real plan catalogue, so the prices
 * on the landing page can never drift from what a redeemed subscription key
 * actually grants.
 */
export function usePublicPlans() {
  return useQuery<PublicPlan[]>({
    queryKey: ["publicPlans"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; plans: PublicPlan[] }>(
        "/api/platform/public-plans",
      );
      return res.plans;
    },
    staleTime: 1000 * 60 * 5,
  });
}
