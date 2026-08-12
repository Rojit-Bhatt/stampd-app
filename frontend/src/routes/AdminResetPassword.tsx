import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "@/lib/toast";
import { apiRequest } from "../lib/api";
import { PLATFORM_NAME } from "../lib/platform";
import { StampdLogo } from "../components/shared/StampdLogo";

// Where the staff password-reset email lands. Slug-less: the token
// identifies the AdminAccount, which is the whole staff namespace.
export default function AdminResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  // Inline field errors — red label directly under the offending input with
  // a red border — replacing the old toast-only validation.
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Shows after the first submit attempt; until then only touched fields
  // surface their errors (blur-gated).
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    document.title = `Set a new password | ${PLATFORM_NAME}`;
  }, []);

  const validate = () => {
    const pErr = password.length < 6 ? "Password must be at least 6 characters." : null;
    setPasswordError(pErr);
    const cErr = !pErr && confirm && password !== confirm ? "Those two passwords don't match." : null;
    setConfirmError(cErr);
    return !pErr && !cErr;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!validate()) return;

    setBusy(true);
    try {
      await apiRequest("/api/admin-auth/reset-password", {
        method: "POST",
        body: { token, password },
      });
      toast.success("Password updated — sign in with it now.");
      navigate("/admin-login");
    } catch (err) {
      toast.error((err as Error).message || "That link may have expired — request a new one.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="w-full max-w-sm text-center">
          <StampdLogo size={44} tile className="mx-auto mb-3.5" />
          <h1 className="font-display text-[22px] font-bold text-[var(--ink)]">Link incomplete</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This link is missing its token — request a fresh one.
          </p>
          <Link
            to="/admin-forgot-password"
            className="stamp-interactive mt-5 inline-block rounded-[var(--radius-btn)] px-6 py-3 text-sm font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <StampdLogo size={44} tile className="mx-auto mb-3.5" />
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Set a new password</h1>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label htmlFor="admin-reset-password" className="block text-[13px] font-semibold text-[var(--ink)]">
              New password
            </label>
            <input
              id="admin-reset-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
                setConfirmError(null);
              }}
              onBlur={() => {
                if (attempted || password.length > 0)
                  setPasswordError(password.length < 6 ? "Password must be at least 6 characters." : null);
              }}
              placeholder="New password"
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? "admin-reset-password-error" : undefined}
              className={`rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3.5 text-sm focus:outline-none ${
                passwordError
                  ? "border-[var(--err)]"
                  : "border-[var(--line)] focus:border-[var(--primary)]"
              }`}
            />
            {passwordError && (
              <p id="admin-reset-password-error" role="alert" className="pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
                {passwordError}
              </p>
            )}
            <label htmlFor="admin-reset-confirm" className="block text-[13px] font-semibold text-[var(--ink)]">
              Confirm new password
            </label>
            <input
              id="admin-reset-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setConfirmError(null);
              }}
              onBlur={() => {
                if (attempted || confirm.length > 0)
                  setConfirmError(password !== confirm ? "Those two passwords don't match." : null);
              }}
              placeholder="Confirm new password"
              aria-invalid={!!confirmError}
              aria-describedby={confirmError ? "admin-reset-confirm-error" : undefined}
              className={`rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3.5 text-sm focus:outline-none ${
                confirmError
                  ? "border-[var(--err)]"
                  : "border-[var(--line)] focus:border-[var(--primary)]"
              }`}
            />
            {confirmError && (
              <p id="admin-reset-confirm-error" role="alert" className="pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
                {confirmError}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-[var(--radius-btn)] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {busy ? "Saving…" : "Set password"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[13px] text-[var(--muted)]">
          <Link to="/admin-login" className="hover:text-[var(--ink)]">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
