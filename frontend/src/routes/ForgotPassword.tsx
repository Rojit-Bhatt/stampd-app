import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";

export default function ForgotPassword() {
  const { companySlug = "", outletSlug = "" } = useParams();
  const slug = outletSlug;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Validation error for an obviously bad address, shown inline in red.
  const [fieldError, setFieldError] = useState<string | null>(null);
  // On success — AND on failure. Never reveal whether an address exists;
  // the previous catch-less version simply hung the form when the request
  // failed, which reads as "nothing happened" to the visitor.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setFieldError("Please enter the email address you signed in with.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("That doesn't look like an email address — check the spelling.");
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <h2 className="font-display text-[22px] font-bold text-[var(--ink)]">Reset your password</h2>
        {sent ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            If an account exists for <b className="text-[var(--ink)]">{email}</b>, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <label htmlFor="forgot-email" className="block text-[13px] font-semibold text-[var(--ink)]">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldError(null);
              }}
              onBlur={() => {
                if (!email.trim()) setFieldError("Please enter the email address you signed in with.");
                else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                  setFieldError("That doesn't look like an email address — check the spelling.");
                else setFieldError(null);
              }}
              placeholder="you@email.com"
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? "forgot-email-error" : undefined}
              className={`rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3.5 text-sm text-[var(--ink)] focus:outline-none ${
                fieldError
                  ? "border-[var(--err)]"
                  : "border-[var(--line)] focus:border-[var(--primary)]"
              }`}
            />
            {fieldError && (
              <p
                id="forgot-email-error"
                role="alert"
                className="pl-1 text-xs font-semibold text-[var(--err)]"
                aria-live="assertive"
              >
                {fieldError}
              </p>
            )}
            <button
              disabled={busy}
              className="rounded-[var(--radius-btn)] py-4 text-[15px] font-bold text-white disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-[13px] text-[var(--muted)]">
          <Link to={tenantPath(companySlug, slug, "login")} className="font-bold text-[var(--primary-deep)] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
