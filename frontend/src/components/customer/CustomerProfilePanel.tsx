import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import toast from "react-hot-toast";

import { useCustomerAuth, type GlobalAccount } from "../../context/CustomerAuthContext";
import { apiRequest } from "../../lib/api";
import { AvatarPicker } from "./AvatarPicker";
import { Button } from "@/components/ui/button";

/**
 * The customer's profile, in one place.
 *
 * Rendered both inside an outlet (`/:company/:outlet/settings`) and on the
 * slug-less `/explore/profile` — deliberately the same component, because
 * everything on it belongs to the global CustomerAccount, not to whichever
 * cafe happens to be on screen. A customer has one name, one password, one
 * picture, however many outlets they visit.
 *
 * That also fixes what the shared tenant-scoped AccountSettingsForm got wrong
 * for customers: it wrote the outlet's User membership row, so a rename was
 * silently reverted by the next ensureMembership sync, and a password change
 * reported success while sign-in — which reads CustomerAccount.password —
 * kept the old one. AccountSettingsForm still serves staff and platform
 * admins, whose identity genuinely does live where it points.
 */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-ambient">
      <div className="mb-3 text-sm font-bold">{title}</div>
      {children}
    </div>
  );
}

const fieldClass =
  "w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none";

export function CustomerProfilePanel({ onLogout }: { onLogout: () => void }) {
  const { globalAccount, setGlobalAccountData } = useCustomerAuth();

  const [name, setName] = useState(globalAccount?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [resending, setResending] = useState(false);

  // Only when the identity itself changes — not on every render, which would
  // fight the customer for control of the input while they're typing.
  useEffect(() => {
    if (globalAccount?.name) setName(globalAccount.name);
  }, [globalAccount?.id, globalAccount?.name]);

  if (!globalAccount) return null;

  const saveName = async () => {
    if (!name.trim()) return;
    setSavingName(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/profile",
        { method: "PATCH", role: "customer-global", body: { name: name.trim() } },
      );
      setGlobalAccountData(res.account);
      toast.success("Name updated!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update your name — try again.");
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setSavingPassword(true);
    try {
      await apiRequest("/api/customer-auth/change-password", {
        method: "POST",
        role: "customer-global",
        body: { currentPassword, newPassword },
      });
      toast.success("Password updated!");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update your password — try again.");
    } finally {
      setSavingPassword(false);
    }
  };

  const resendVerification = async () => {
    setResending(true);
    try {
      await apiRequest("/api/customer-auth/resend-verification", {
        method: "POST",
        body: { email: globalAccount.email },
      });
      toast.success("Verification email sent — check your inbox.");
    } catch {
      toast.error("Couldn't resend that — try again in a bit.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex max-w-[480px] flex-col gap-6">
      <AvatarPicker />

      <Card title="Profile">
        <label className="mb-1.5 block text-sm font-bold" htmlFor="profile-name">
          Name
        </label>
        <input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`mb-3 ${fieldClass}`}
        />
        <div className="mb-3 text-[13px] text-[var(--muted)]">{globalAccount.email}</div>
        <Button onClick={saveName} disabled={savingName || !name.trim()}>
          {savingName ? "Saving…" : "Save name"}
        </Button>
      </Card>

      <Card title="Email verification">
        <div className="mb-3 text-[13px] text-[var(--muted)]">
          {globalAccount.emailVerified
            ? "Verified"
            : "Not verified — you can still earn points, but you'll need this to redeem them."}
        </div>
        {!globalAccount.emailVerified && (
          <Button variant="outline" onClick={resendVerification} disabled={resending}>
            {resending ? "Sending…" : "Resend verification email"}
          </Button>
        )}
      </Card>

      <Card title="Change password">
        <label className="mb-1.5 block text-sm font-bold" htmlFor="current-password">
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={`mb-3 ${fieldClass}`}
        />
        <label className="mb-1.5 block text-sm font-bold" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={`mb-3 ${fieldClass}`}
        />
        <Button onClick={savePassword} disabled={savingPassword || !currentPassword || !newPassword}>
          {savingPassword ? "Saving…" : "Update password"}
        </Button>
      </Card>

      {/* Lives here rather than in either navbar: logging out is the one thing
          on this page you can't undo with another tap, so it belongs at the
          bottom of the page you went to on purpose, not one stray tap from
          the header of every screen. */}
      <Button
        variant="ghost"
        onClick={onLogout}
        className="w-full text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </Button>
    </div>
  );
}
