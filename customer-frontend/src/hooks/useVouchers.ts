import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface Voucher {
  voucherCode: string;
  isValid: boolean;
  earnedAt: string;
}

export function useVouchers() {
  return useQuery<Voucher[]>({
    queryKey: ["vouchers"],
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; vouchers: Voucher[] }>(
        "/api/vouchers/my-wallet"
      );
      return response.vouchers || [];
    },
    staleTime: 1000 * 30, // 30 seconds cache duration
  });
}
