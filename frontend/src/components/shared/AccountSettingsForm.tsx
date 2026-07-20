import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { LogOut } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAccount, useUpdateProfile, useChangePassword } from "../../hooks/useAccount";
import { Skeleton } from "../ui/skeleton";

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
    return (
      <div className="flex max-w-[480px] flex-col gap-6">
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
          <Skeleton className="mb-3 h-4 w-20" />
          <Skeleton className="mb-1.5 h-3 w-16" />
          <Skeleton className="mb-3 h-11 w-full rounded-[var(--radius-btn)]" />
          <Skeleton className="mb-3 h-3 w-40" />
          <Skeleton className="h-10 w-28 rounded-[var(--radius-btn)]" />
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
          <Skeleton className="mb-3 h-4 w-32" />
          <Skeleton className="mb-1.5 h-3 w-24" />
          <Skeleton className="mb-3 h-11 w-full rounded-[var(--radius-btn)]" />
          <Skeleton className="mb-1.5 h-3 w-24" />
          <Skeleton className="mb-3 h-11 w-full rounded-[var(--radius-btn)]" />
          <Skeleton className="h-10 w-32 rounded-[var(--radius-btn)]" />
        </div>
      </div>
    );
  }

  const saveName = async () => {
    if (!name.trim()) return;
    try {
      await updateProfile.mutateAsync(name);
      toast.success("Name updated!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update your name — try again.");
    }
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) return;
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast.success("Password updated!");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update your password — try again.");
    }
  };

  const resendVerification = async () => {
    setResending(true);
    try {
      // A customer's verified flag lives on the global CustomerAccount and is
      // fanned out to every outlet membership from there; the tenant-scoped
      // /api/auth link only ever verifies the one outlet's row, which is not
      // what the redeem gate reads across the rest of the app. Staff keep
      // their own identity system, so they keep their own endpoint.
      const path =
        role === "customer"
          ? "/api/customer-auth/resend-verification"
          : "/api/admin-auth/resend-verification";
      await apiRequest(path, { method: "POST", body: { email: account.email } });
      toast.success("Verification email sent — check your inbox.");
    } catch {
      toast.error("Couldn't resend that — try again in a bit.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex max-w-[480px] flex-col gap-6">
      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
        <div className="mb-3 text-sm font-bold">Profile</div>
        <label className="mb-1.5 block text-sm font-bold">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <div className="mb-3 text-[13px] text-[var(--muted)]">{account.email}</div>
        <button
          onClick={saveName}
          disabled={updateProfile.isPending || !name.trim()}
          className="rounded-[var(--radius-btn)] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--primary)" }}
        >
          {updateProfile.isPending ? "Saving…" : "Save name"}
        </button>
      </div>

      {role !== "platform" && (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
          <div className="mb-2 text-sm font-bold">Email verification</div>
          <div className="mb-3 text-[13px] text-[var(--muted)]">
            {account.emailVerified
              ? "Verified"
              : role === "customer"
                ? "Not verified — you can still earn points, but you'll need this to redeem them."
                : "Not verified"}
          </div>
          {!account.emailVerified && (
            <button
              onClick={resendVerification}
              disabled={resending}
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
          )}
        </div>
      )}

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
        <div className="mb-3 text-sm font-bold">Change password</div>
        <label className="mb-1.5 block text-sm font-bold">Current password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <label className="mb-1.5 block text-sm font-bold">New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        />
        <button
          onClick={savePassword}
          disabled={changePassword.isPending || !currentPassword || !newPassword}
          className="rounded-[var(--radius-btn)] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--primary)" }}
        >
          {changePassword.isPending ? "Saving…" : "Update password"}
        </button>
      </div>

      {onLogout && (
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 text-sm font-bold text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      )}
    </div>
  );
}
