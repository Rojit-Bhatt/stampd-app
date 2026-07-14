import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface AdminBranding {
  tagline: string;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
}

export interface AdminContact {
  phone: string;
  email: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hours: string;
  aboutUs: string;
  socials: {
    instagram: string;
    facebook: string;
    x: string;
  };
}

export interface AdminProgram {
  stampsRequired: number;
  rewardTitle: string;
  rewardDescription: string;
  cooldownHours: number;
  minBillAmount: number;
}

export interface AdminSettings {
  name: string;
  slug: string;
  status: "active" | "suspended";
  branding: AdminBranding;
  contact: AdminContact;
  program: AdminProgram;
  menuEnabled: boolean;
}

export interface AdminSettingsPatch {
  name?: string;
  branding?: Partial<AdminBranding>;
  contact?: Partial<AdminContact>;
  program?: Partial<AdminProgram>;
  menuEnabled?: boolean;
}

export function useAdminSettings() {
  return useQuery<AdminSettings>({
    queryKey: ["adminSettings"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; settings: AdminSettings }>(
        "/api/admin/settings",
        { role: "admin" },
      );
      return res.settings;
    },
    staleTime: 1000 * 30,
  });
}

export function useUpdateAdminSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: AdminSettingsPatch) => {
      const res = await apiRequest<{ success: boolean; settings: AdminSettings }>(
        "/api/admin/settings",
        { method: "PATCH", role: "admin", body: patch },
      );
      return res.settings;
    },
    onSuccess: (settings) => {
      qc.setQueryData(["adminSettings"], settings);
    },
  });
}
