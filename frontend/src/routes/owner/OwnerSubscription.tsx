import { SubscriptionPanel } from "../../components/shared/SubscriptionPanel";

export default function OwnerSubscription() {
  return (
    <SubscriptionPanel
      queryKey="ownerSubscription"
      fetchPath="/api/owner/subscription"
      redeemPath="/api/owner/subscription/redeem-key"
      role="owner-global"
    />
  );
}
