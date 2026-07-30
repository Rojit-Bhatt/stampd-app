import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface PlatformContact {
  phone: string;
  email: string;
  address: string;
  hours: string;
  aboutUs: string;
  socials: {
    instagram: string;
    facebook: string;
    tiktok: string;
    x: string;
    linkedin: string;
    youtube: string;
  };
}

// Public read — used by the platform landing page. No auth required, no
// role needed (the request just carries no Authorization header at all
// since the route ignores it).
export function usePlatformContact() {
  return useQuery<PlatformContact>({
    queryKey: ["platformContact", "public"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; contact: PlatformContact }>(
        "/api/platform/public-contact",
      );
      return res.contact;
    },
    staleTime: 1000 * 60,
  });
}

// Authenticated read — used by the platform console's Contact page.
export function usePlatformContactAdmin() {
  return useQuery<PlatformContact>({
    queryKey: ["platformContact", "admin"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; contact: PlatformContact }>(
        "/api/platform/contact",
        { role: "platform" },
      );
      return res.contact;
    },
  });
}

export function useUpdatePlatformContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<PlatformContact>) => {
      const res = await apiRequest<{ success: boolean; contact: PlatformContact }>(
        "/api/platform/contact",
        { method: "PATCH", role: "platform", body: patch },
      );
      return res.contact;
    },
    onSuccess: (contact) => {
      qc.setQueryData(["platformContact", "admin"], contact);
      qc.setQueryData(["platformContact", "public"], contact);
    },
  });
}
