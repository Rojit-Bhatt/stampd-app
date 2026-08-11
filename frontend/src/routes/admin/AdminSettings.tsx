import { User, ShieldQuestion, Users } from "lucide-react";
import { AccountSettingsForm } from "../../components/shared/AccountSettingsForm";
import { SettingsList, type SettingsSection } from "../../components/shared/profile/SettingsList";
import { CustomerInfoSettingsTab } from "../../components/admin/CustomerInfoSettingsTab";
import { SubAdminSettingsTab } from "../../components/admin/SubAdminSettingsTab";
import { useAdminSettings } from "../../hooks/useAdminSettings";

export default function AdminSettings() {
  const { data: settings } = useAdminSettings();

  const sections: SettingsSection[] = [
    { id: "account", label: "Account", icon: User, content: <AccountSettingsForm role="admin" /> },
    {
      id: "privacy",
      label: "Privacy & data collection",
      icon: ShieldQuestion,
      content: <CustomerInfoSettingsTab />,
    },
    // Only the primary admin (staffRole null) can manage_staff — a manager
    // sees the other two rows; a staff account never reaches Settings at
    // all. This gate is convenience only: the server refuses regardless.
    ...(settings?.staffRole === null
      ? [{ id: "staff", label: "Staff", icon: Users, content: <SubAdminSettingsTab /> } as SettingsSection]
      : []),
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.015em] text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[var(--muted)]">Your account, and what you collect from customers.</p>
      <SettingsList sections={sections} />
    </div>
  );
}
