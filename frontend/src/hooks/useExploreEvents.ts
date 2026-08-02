import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface ExploreEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  organizationId: string;
  /** The OUTLET slug. Unique only within its company — never a path on its own. */
  slug: string;
  companySlug: string;
  businessName: string;
  branding: {
    logoUrl: string;
    primaryColor: string;
  };
}

export function useExploreEvents() {
  return useQuery<ExploreEvent[]>({
    queryKey: ["exploreEvents"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; events: ExploreEvent[] }>(
        "/api/customer-auth/events",
        { role: "customer-global" },
      );
      return res.events || [];
    },
  });
}
