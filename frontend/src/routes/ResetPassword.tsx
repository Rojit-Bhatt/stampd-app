import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "@/lib/toast";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";

export default function ResetPassword() {
  const { companySlug = "", outletSlug = "" } = useParams();
  const slug = outletSlug;
  const [params] = useSearchParams();
  const navigate = useNavigate();
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

  const validate = () => {
    const pErr = password.length < 6 ? "Needs to be at least 6 characters." : null;
    setPasswordError(pErr);
    const cErr = !pErr && confirm && password !== confirm ? "Those passwords don't match." : null;
    setConfirmError(cErr);
    return !pErr && !cErr;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!validate()) return;
    const token = params.get("token");
    setBusy(true);
    try {
      await apiRequest("/api/auth/reset-password", { method: "POST", body: { token, password } });
      toast.success("Password updated! Go ahead and sign in.");
      navigate(tenantPath(companySlug, slug, "login"));
    } catch (err) {
      toast.error((err as Error).message || "Couldn't reset that — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <h2 className="font-display text-[22px] font-bold text-[var(--ink)]">Choose a new password</h2>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label htmlFor="reset-password" className="block text-[13px] font-semibold text-[var(--ink)]">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError(null);
              setConfirmError(null);
            }}
            onBlur={() => {
              if (attempted || password.length > 0) setPasswordError(password.length < 6 ? "Needs to be at least 6 characters." : null);
            }}
            placeholder="New password"
            aria-invalid={!!passwordError}
            aria-describedby={passwordError ? "reset-password-error" : undefined}
            className={`rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3.5 text-sm text-[var(--ink)] focus:outline-none ${
              passwordError
                ? "border-[var(--err)]"
                : "border-[var(--line)] focus:border-[var(--primary)]"
            }`}
          />
          {passwordError && (
            <p id="reset-password-error" role="alert" className="pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
              {passwordError}
            </p>
          )}
          <label htmlFor="reset-confirm" className="block text-[13px] font-semibold text-[var(--ink)]">
            Confirm password
          </label>
          <input
            id="reset-confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setConfirmError(null);
            }}
            onBlur={() => {
              if (attempted || confirm.length > 0)
                setConfirmError(password !== confirm ? "Those passwords don't match." : null);
            }}
            placeholder="Confirm password"
            aria-invalid={!!confirmError}
            aria-describedby={confirmError ? "reset-confirm-error" : undefined}
            className={`rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3.5 text-sm text-[var(--ink)] focus:outline-none ${
              confirmError
                ? "border-[var(--err)]"
                : "border-[var(--line)] focus:border-[var(--primary)]"
            }`}
          />
          {confirmError && (
            <p id="reset-confirm-error" role="alert" className="pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
              {confirmError}
            </p>
          )}
          <button
            disabled={busy}
            className="rounded-[var(--radius-btn)] py-4 text-[15px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--primary)" }}
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
