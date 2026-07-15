import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { LogOut } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAccount, useUpdateProfile, useChangePassword } from "../../hooks/useAccount";

interface AccountSettingsFormProps {
  role: "admin" | "customer" | "platform";
  // When provided, renders a "Log out" button below every other section —
  // used by the customer app, which reaches Settings via a bottom-nav tab
  // rather than a header dropdown (admin/platform keep logout in their
  // existing sidebar AccountMenu, so they don't pass this).
  onLogout?: () => void;
}

export function AccountSettingsForm({ role, onLogout }: AccountSettingsFormProps) {
  const { data: account, isLoading } = useAccount(role);
  const updateProfile = useUpdateProfile(role);
  const changePassword = useChangePassword(role);

  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (account && !name) setName(account.name);
  }, [account, name]);

  if (isLoading || !account) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }

  const saveName = async () => {
    if (!name.trim()) return;
    try {
      await updateProfile.mutateAsync(name);
      toast.success("Name updated");
    } catch (err) {
      toast.error((err as Error).message || "Failed to update name.");
    }
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) return;
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error((err as Error).message || "Failed to update password.");
    }
  };

  const resendVerification = async () => {
    setResending(true);
    try {
      await apiRequest("/api/auth/resend-verification", { method: "POST", body: { email: account.email } });
      toast.success("Verification email resent.");
    } catch {
      toast.error("Could not resend. Try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex max-w-[480px] flex-col gap-6">
      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-3 text-sm font-bold">Profile</div>
        <label className="mb-1.5 block text-sm font-bold">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
        />
        <div className="mb-3 text-[13px] text-[var(--muted)]">{account.email}</div>
        <button
          onClick={saveName}
          disabled={updateProfile.isPending || !name.trim()}
          className="rounded-[13px] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {updateProfile.isPending ? "Saving…" : "Save name"}
        </button>
      </div>

      {role !== "platform" && (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="mb-2 text-sm font-bold">Email verification</div>
          <div className="mb-3 text-[13px] text-[var(--muted)]">
            {account.emailVerified ? "Verified" : "Not verified"}
          </div>
          {!account.emailVerified && (
            <button
              onClick={resendVerification}
              disabled={resending}
              className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
          )}
        </div>
      )}

      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-3 text-sm font-bold">Change password</div>
        <label className="mb-1.5 block text-sm font-bold">Current password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="mb-3 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
        />
        <label className="mb-1.5 block text-sm font-bold">New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mb-3 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
        />
        <button
          onClick={savePassword}
          disabled={changePassword.isPending || !currentPassword || !newPassword}
          className="rounded-[13px] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {changePassword.isPending ? "Saving…" : "Update password"}
        </button>
      </div>

      {onLogout && (
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 rounded-[13px] border border-[var(--line)] bg-[var(--surface)] py-3 text-sm font-bold text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      )}
    </div>
  );
}
