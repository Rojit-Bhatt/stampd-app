import { AccountSettingsForm } from "../components/shared/AccountSettingsForm";

export default function CustomerSettings() {
  return (
    <div className="px-5 py-6">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[13px] text-[var(--muted)]">Your account details.</p>
      <AccountSettingsForm role="customer" />
    </div>
  );
}
