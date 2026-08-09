import { AccountSettingsForm } from "../../components/shared/AccountSettingsForm";
import { SettingsTabs } from "../../components/shared/SettingsTabs";
import { CustomerInfoSettingsTab } from "../../components/admin/CustomerInfoSettingsTab";
import { SubAdminSettingsTab } from "../../components/admin/SubAdminSettingsTab";
import { useAdminSettings } from "../../hooks/useAdminSettings";

export default function AdminSettings() {
  const { data: settings } = useAdminSettings();

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.015em] text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[var(--muted)]">Your account, and what you collect from customers.</p>
      <SettingsTabs
        tabs={[
          { value: "account", label: "Account", content: <AccountSettingsForm role="admin" /> },
          { value: "customer-info", label: "Customer Info", content: <CustomerInfoSettingsTab /> },
          // Only the primary admin (staffRole null) can manage_staff — a
          // manager sees the other two tabs; a staff account never reaches
          // Settings at all. This gate is convenience only: the server
          // refuses regardless.
          ...(settings?.staffRole === null
            ? [{ value: "sub-admin", label: "Sub-Admin", content: <SubAdminSettingsTab /> }]
            : []),
        ]}
      />
    </div>
  );
}
