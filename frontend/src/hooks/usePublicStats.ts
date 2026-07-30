import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../lib/api";

/**
 * The landing page's hero figures.
 *
 * `visible: false` is not an error state — it is the backend saying the
 * platform is below the threshold where showing figures helps. The consumer
 * renders nothing in that case rather than a zero or a placeholder.
 */
export type PublicStats =
  | { visible: false }
  | { visible: true; outlets: number; pointsIssuedMonth: number; customers: number };

export function usePublicStats() {
  return useQuery<PublicStats>({
    queryKey: ["publicStats"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; stats: PublicStats }>(
        "/api/platform/public-stats",
      );
      return res.stats;
    },
    staleTime: 1000 * 60 * 5,
  });
}
