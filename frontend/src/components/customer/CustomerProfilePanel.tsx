import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import toast from "react-hot-toast";

import { useCustomerAuth, type GlobalAccount, type Gender } from "../../context/CustomerAuthContext";
import { apiRequest } from "../../lib/api";
import { AvatarPicker } from "./AvatarPicker";
import { VerifyCodeCard } from "../shared/auth/VerifyCodeCard";
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

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
};

export function CustomerProfilePanel({ onLogout }: { onLogout: () => void }) {
  const { globalAccount, setGlobalAccountData } = useCustomerAuth();

  const [name, setName] = useState(globalAccount?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [showVerify, setShowVerify] = useState(false);

  const [emailOptIn, setEmailOptIn] = useState(globalAccount?.marketingConsent?.email?.granted ?? false);
  const [smsOptIn, setSmsOptIn] = useState(globalAccount?.marketingConsent?.sms?.granted ?? false);
  const [savingSmsOptIn, setSavingSmsOptIn] = useState(false);
  const [savingEmailOptIn, setSavingEmailOptIn] = useState(false);
  const [birthdayMonth, setBirthdayMonth] = useState<number | "">(globalAccount?.birthdayMonth ?? "");
  const [birthdayDay, setBirthdayDay] = useState<number | "">(globalAccount?.birthdayDay ?? "");
  const [gender, setGender] = useState<Gender | "">(globalAccount?.gender ?? "");
  const [savingBirthday, setSavingBirthday] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [savingPush, setSavingPush] = useState(false);

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Only when the identity itself changes — not on every render, which would
  // fight the customer for control of the input while they're typing.
  useEffect(() => {
    if (globalAccount?.name) setName(globalAccount.name);
  }, [globalAccount?.id, globalAccount?.name]);

  // The browser, not the server, is the source of truth for "is THIS
  // device subscribed" — a customer's account-wide push consent flag
  // doesn't tell you whether this specific browser still has a live
  // subscription.
  useEffect(() => {
    navigator.serviceWorker?.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushEnabled(!!sub))
      .catch(() => setPushEnabled(false));
  }, []);

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

  const handleDeleteAccount = async () => {
    if (confirmEmail !== globalAccount.email) return;
    setDeleting(true);
    try {
      await apiRequest("/api/customer-auth/profile", {
        method: "DELETE",
        role: "customer-global",
        body: { email: confirmEmail },
      });
      toast.success("Your account has been permanently deleted.");
      onLogout();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't delete account — try again.");
    } finally {
      setDeleting(false);
    }
  };

  const saveEmailOptIn = async (next: boolean) => {
    setEmailOptIn(next);
    setSavingEmailOptIn(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/preferences",
        { method: "PATCH", role: "customer-global", body: { emailOptIn: next } },
      );
      setGlobalAccountData(res.account);
      toast.success(next ? "You're opted in!" : "Opted out.");
    } catch (err) {
      setEmailOptIn(!next);
      toast.error((err as Error).message || "Couldn't update that — try again.");
    } finally {
      setSavingEmailOptIn(false);
    }
  };

  const saveSmsOptIn = async (next: boolean) => {
    setSmsOptIn(next);
    setSavingSmsOptIn(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/preferences",
        { method: "PATCH", role: "customer-global", body: { smsOptIn: next } },
      );
      setGlobalAccountData(res.account);
      toast.success(next ? "You're opted in!" : "Opted out.");
    } catch (err) {
      setSmsOptIn(!next);
      toast.error((err as Error).message || "Couldn't update that — try again.");
    } finally {
      setSavingSmsOptIn(false);
    }
  };

  const savePersonalInfo = async () => {
    setSavingBirthday(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/preferences",
        {
          method: "PATCH",
          role: "customer-global",
          body: {
            birthdayMonth: birthdayMonth === "" ? null : birthdayMonth,
            birthdayDay: birthdayDay === "" ? null : birthdayDay,
            gender: gender === "" ? null : gender,
          },
        },
      );
      setGlobalAccountData(res.account);
      toast.success("Saved!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update that — try again.");
    } finally {
      setSavingBirthday(false);
    }
  };

  const savePushOptIn = async (next: boolean) => {
    setSavingPush(true);
    try {
      if (next) {
        if (!VAPID_PUBLIC_KEY) throw new Error("Push isn't set up for this app yet.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notification permission wasn't granted.");
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const json = subscription.toJSON();
        await apiRequest("/api/customer-auth/push-subscription", {
          method: "POST",
          role: "customer-global",
          body: { endpoint: json.endpoint, keys: json.keys },
        });
        setPushEnabled(true);
        toast.success("Push notifications on!");
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await apiRequest("/api/customer-auth/push-subscription", {
            method: "DELETE",
            role: "customer-global",
            body: { endpoint: subscription.endpoint },
          });
          await subscription.unsubscribe();
        }
        setPushEnabled(false);
        toast.success("Push notifications off.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update that — try again.");
    } finally {
      setSavingPush(false);
    }
  };

  const resendVerification = async () => {
    try {
      await apiRequest("/api/customer-auth/resend-verification", {
        method: "POST",
        body: { email: globalAccount.email },
      });
      toast.success("A new code is on its way — check your inbox.");
    } catch {
      toast.error("Couldn't resend that — try again in a bit.");
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

      <Card title="Email updates">
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={emailOptIn}
            disabled={savingEmailOptIn}
            onChange={(e) => saveEmailOptIn(e.target.checked)}
          />
          Send me offers and updates by email
        </label>
      </Card>

      <Card title="SMS updates">
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={smsOptIn}
            disabled={savingSmsOptIn}
            onChange={(e) => saveSmsOptIn(e.target.checked)}
          />
          Send me offers and updates by SMS
        </label>
      </Card>

      <Card title="Push notifications">
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={pushEnabled}
            disabled={savingPush}
            onChange={(e) => savePushOptIn(e.target.checked)}
          />
          Send me updates as push notifications
        </label>
      </Card>

      <Card title="Personal info">
        <p className="mb-3 text-sm text-[var(--muted)]">Optional — we'll send you something nice on your birthday.</p>
        <div className="mb-3 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={12}
            placeholder="Month"
            value={birthdayMonth}
            onChange={(e) => setBirthdayMonth(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-20 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            max={31}
            placeholder="Day"
            value={birthdayDay}
            onChange={(e) => setBirthdayDay(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-20 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </div>
        <select
          value={gender ?? ""}
          onChange={(e) => setGender((e.target.value || "") as Gender | "")}
          className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="">Gender — prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
        <div className="flex items-center gap-2">
          <Button onClick={savePersonalInfo} disabled={savingBirthday}>
            {savingBirthday ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>

      <Card title="Email verification">
        <div className="mb-3 text-[13px] text-[var(--muted)]">
          {globalAccount.emailVerified
            ? "Verified"
            : "Not verified — you can still earn points, but you'll need this to redeem them."}
        </div>
        {!globalAccount.emailVerified && (
          showVerify ? (
            <VerifyCodeCard
              size="inline"
              email={globalAccount.email}
              verify={async (code) => {
                await apiRequest("/api/customer-auth/verify-otp", {
                  method: "POST",
                  body: { email: globalAccount.email, code },
                });
              }}
              resend={resendVerification}
              onVerified={() => {
                toast.success("Email verified!");
                setShowVerify(false);
                setGlobalAccountData({ ...globalAccount, emailVerified: true });
              }}
            />
          ) : (
            <Button variant="outline" onClick={() => setShowVerify(true)}>
              Verify email
            </Button>
          )
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

      <Card title="Delete account">
        <div className="mb-3 text-[13px] text-[var(--muted)] leading-relaxed">
          Once you delete your account, there is no going back. All of your points, memberships, and profile details will be permanently removed across all cafes.
        </div>
        
        {!showConfirmDelete ? (
          <Button
            variant="destructive"
            onClick={() => setShowConfirmDelete(true)}
          >
            Delete account
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <p className="text-[13px] text-red-600 dark:text-red-400 font-medium">
              Please type <strong className="select-all break-all">{globalAccount.email}</strong> to confirm deletion.
            </p>
            <input
              type="text"
              placeholder={globalAccount.email}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="w-full rounded-[var(--radius-btn)] border border-red-200 bg-[var(--bg)] px-4 py-3 text-sm focus:border-red-500 focus:outline-none dark:border-red-900 text-[var(--ink)]"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={confirmEmail !== globalAccount.email || deleting}
                onClick={handleDeleteAccount}
                className="flex-1"
              >
                {deleting ? "Deleting…" : "Confirm Delete"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirmDelete(false);
                  setConfirmEmail("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
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
