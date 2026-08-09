import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useCustomerAuth, type GlobalAccount } from "../context/CustomerAuthContext";

// globalAccount is a localStorage snapshot, refreshed only on explicit
// login/register/completeProfile actions in the current browser tab — it can
// drift stale against the server (phone completed from another device or
// tab, for instance). The phone gates in CustomerLayout/GlobalCustomerLayout
// use this to confirm a cached "no phone" is still true before blocking the
// customer with PhoneStepModal.
export function useAccountRefresh(enabled: boolean) {
  const { globalAccount, setGlobalAccountData } = useCustomerAuth();
  return useQuery({
    queryKey: ["globalAccountMe", globalAccount?.id],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/me",
        { role: "customer-global" },
      );
      if (res.success && res.account) setGlobalAccountData(res.account);
      return res.account;
    },
    enabled: enabled && Boolean(globalAccount),
    staleTime: 0,
  });
}
