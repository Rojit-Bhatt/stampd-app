import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface StampCardData {
  stampsEarned: number;
  lastStampedAt: string | null;
}

export function useStampCard() {
  return useQuery<StampCardData>({
    queryKey: ["stampCard"],
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: StampCardData }>(
        "/api/stamps/balance"
      );
      return response.data;
    },
    staleTime: 1000 * 30, // 30 seconds cache duration
  });
}
