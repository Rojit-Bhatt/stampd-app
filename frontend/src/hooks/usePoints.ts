import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useTenant } from "../context/TenantContext";

// A balance belongs to ONE outlet — points never pool across outlets — which
// is why every query key here is scoped by both slugs.
export interface PointsBalance {
  balance: number;
  lastActivityAt: string | null;
  /** Null when the outlet's program never expires points. */
  expiresAt: string | null;
  earnPercent: number;
  /** 0 = never expires. */
  pointsExpiryDays: number;
}

export interface PointsTransaction {
  id: string;
  type: "earn" | "redeem" | "expire";
  /** Signed: positive for earn, negative for redeem and expire. */
  points: number;
  balanceAfter: number;
  billAmount: number | null;
  rewardName: string;
  createdAt: string;
}

export interface RewardItem {
  id: string;
  name: string;
  description: string;
  category: string;
  pointsPrice: number;
}

export function usePointsBalance() {
  const { companySlug, outletSlug } = useTenant();
  return useQuery<PointsBalance>({
    queryKey: ["pointsBalance", companySlug, outletSlug],
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: PointsBalance }>("/api/points/balance");
      return response.data;
    },
    staleTime: 1000 * 30,
  });
}

export function usePointsHistory() {
  const { companySlug, outletSlug } = useTenant();
  return useQuery<PointsTransaction[]>({
    queryKey: ["pointsHistory", companySlug, outletSlug],
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: PointsTransaction[] }>("/api/points/history");
      return response.data || [];
    },
    staleTime: 1000 * 30,
  });
}

// What this outlet will accept points for. Only items the outlet has given a
// points price — the rest of the menu stays browse-only.
export function useRewardCatalog(enabled = true) {
  const { companySlug, outletSlug } = useTenant();
  return useQuery<RewardItem[]>({
    queryKey: ["rewardCatalog", companySlug, outletSlug],
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: RewardItem[] }>("/api/points/catalog");
      return response.data || [];
    },
    enabled,
  });
}

// Formats a points figure for display. Points are fractional (an outlet can
// return 10% of a bill), but a whole number should read as one — "250", not
// "250.00".
export function formatPoints(points: number): string {
  if (!Number.isFinite(points)) return "0";
  const rounded = Math.round(points * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}
