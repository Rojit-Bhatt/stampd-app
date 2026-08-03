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
  logoImageId: string | null;
  bannerImageId: string | null;
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
  googleReviewUrl?: string;
  socials: {
    instagram: string;
    facebook: string;
    x: string;
    tiktok?: string;
  };
}

// This outlet's OVERRIDES. A null means "inherit from the company" — the
// nulls are load-bearing, so this can't be typed as plain numbers.
export interface AdminProgram {
  earnPercent: number | null;
  pointsExpiryDays: number | null;
}

// The values that actually apply here, after the outlet's overrides are laid
// over the company's defaults. Always numbers; never null.
export interface ResolvedProgram {
  earnPercent: number;
  pointsExpiryDays: number;
}

export interface TierThreshold {
  minVisits: number | null;
  minSpend: number | null;
}

export interface TierThresholds {
  Bronze: TierThreshold;
  Silver: TierThreshold;
  Gold: TierThreshold;
  Platinum: TierThreshold;
}

export interface MessagingTriggers {
  milestone: { visitCount: number | null };
  inactivity: { days: number | null };
  birthday: { enabled: boolean };
}

export interface CustomerInfoSettings {
  requireDateOfBirth: boolean;
  requireGender: boolean;
}

export interface AdminSettings {
  name: string;
  slug: string;
  status: "active" | "suspended";
  category: BusinessCategory;
  branding: AdminBranding;
  contact: AdminContact;
  adminEmailVerified: boolean;
  /** This outlet's raw overrides (null = inherit). */
  program: AdminProgram;
  /** What actually applies, company defaults resolved in. */
  programResolved: ResolvedProgram;
  /** Which fields this outlet has taken control of. */
  programOverridden: (keyof AdminProgram)[];
  /** The company's defaults, for showing what "inherit" means. */
  companyProgramDefaults: ResolvedProgram | null;
  /** Per-outlet tier thresholds, keyed by fixed label. No inheritance. */
  tierThresholds: TierThresholds;
  messagingTriggers: MessagingTriggers;
  customerInfo: CustomerInfoSettings;
  menuEnabled: boolean;
  /** The acting admin's role. null = the outlet's primary admin, full access. */
  staffRole: "manager" | "staff" | null;
  /** True once anyone at this outlet has a PIN — see the design doc, §2.2. */
  staffPinRequired: boolean;
  // False for a platform-onboarded business with no attached owner — the
  // Subscription nav item/route must be hidden for it (there's nothing to
  // show; GET /api/admin/subscription 404s).
  hasOwnerAccount: boolean;
  // Only present when this business has an owner account attached AND
  // renewal is within the reminder window (see subscriptionService in the
  // backend) — absent otherwise, never a "no subscription" placeholder.
  subscriptionReminder?: { show: boolean; daysLeft: number; effectiveStatus: string };
}

export interface AdminSettingsPatch {
  name?: string;
  category?: BusinessCategory;
  branding?: Partial<AdminBranding>;
  contact?: Partial<AdminContact>;
  program?: Partial<AdminProgram>;
  tierThresholds?: Partial<TierThresholds>;
  messagingTriggers?: Partial<MessagingTriggers>;
  customerInfo?: Partial<CustomerInfoSettings>;
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
