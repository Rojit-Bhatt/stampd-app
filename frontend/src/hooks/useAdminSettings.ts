import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";

// Mirrors backend/config/platform.js's BUSINESS_CATEGORIES.
export const BUSINESS_CATEGORIES = ["cafe", "restaurant", "bakery", "salon", "gym", "retail", "other"] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  bakery: "Bakery",
  salon: "Salon",
  gym: "Gym",
  retail: "Retail",
  other: "Other",
};

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
  voucherExpiryDays: number;
}

export interface AdminSettings {
  name: string;
  slug: string;
  status: "active" | "suspended";
  category: BusinessCategory;
  branding: AdminBranding;
  contact: AdminContact;
  adminEmailVerified: boolean;
  program: AdminProgram;
  menuEnabled: boolean;
}

export interface AdminSettingsPatch {
  name?: string;
  category?: BusinessCategory;
  branding?: Partial<AdminBranding>;
  contact?: Partial<AdminContact>;
  program?: Partial<AdminProgram>;
  menuEnabled?: boolean;
}

export function useAdminSettings() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<AdminSettings>({
    queryKey: ["adminSettings", orgId],
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
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useMutation({
    mutationFn: async (patch: AdminSettingsPatch) => {
      const res = await apiRequest<{ success: boolean; settings: AdminSettings }>(
        "/api/admin/settings",
        { method: "PATCH", role: "admin", body: patch },
      );
      return res.settings;
    },
    onSuccess: (settings) => {
      qc.setQueryData(["adminSettings", orgId], settings);
    },
  });
}
