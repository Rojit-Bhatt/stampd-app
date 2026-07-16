import { SubscriptionPanel } from "../../components/shared/SubscriptionPanel";

export default function AdminSubscription() {
  return (
    <SubscriptionPanel
      queryKey="adminSubscription"
      fetchPath="/api/admin/subscription"
      redeemPath="/api/admin/subscription/redeem-key"
      role="admin"
      extraInvalidateKeyPrefixes={["adminSettings"]}
    />
  );
}
