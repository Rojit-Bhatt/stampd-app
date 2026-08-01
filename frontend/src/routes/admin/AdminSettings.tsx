import { AccountSettingsForm } from "../../components/shared/AccountSettingsForm";
import { SettingsTabs } from "../../components/shared/SettingsTabs";
import { CustomerInfoSettingsTab } from "../../components/admin/CustomerInfoSettingsTab";

export default function AdminSettings() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[var(--muted)]">Your account, and what you collect from customers.</p>
      <SettingsTabs
        tabs={[
          { value: "account", label: "Account", content: <AccountSettingsForm role="admin" /> },
          { value: "customer-info", label: "Customer Info", content: <CustomerInfoSettingsTab /> },
        ]}
      />
    </div>
  );
}
