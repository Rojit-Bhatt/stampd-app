import { AccountSettingsForm } from "../../components/shared/AccountSettingsForm";

export default function PlatformSettings() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[var(--muted)]">Your account details.</p>
      <AccountSettingsForm role="platform" />
    </div>
  );
}
