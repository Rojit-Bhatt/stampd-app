import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { PLATFORM_NAME } from "../lib/platform";
import { StampdLogo } from "../components/shared/StampdLogo";

// Slug-less, like the staff login it sits under: the email identifies the
// AdminAccount, and a company owner has no outlet to be scoped to.
//
// AdminLogin.tsx has always linked here; the route just never existed.
export default function AdminForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `Reset your password | ${PLATFORM_NAME}`;
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest("/api/admin-auth/forgot-password", { method: "POST", body: { email } });
      // Deliberately unconditional: the server answers the same way whether
      // or not the account exists, and so does this — otherwise the form
      // becomes an account-existence oracle.
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
        <div className="mb-6 text-center">
          <StampdLogo size={44} tile className="mx-auto mb-3.5" />
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Reset your password</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            We'll email you a link to set a new one.
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
          {sent ? (
            <p className="text-center text-sm text-[var(--muted)]">
              If <span className="font-bold text-[var(--ink)]">{email}</span> is registered, a reset
              link is on its way. Check your inbox.
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-1 w-full rounded-[var(--radius-btn)] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--primary)" }}
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[13px] text-[var(--muted)]">
          <Link to="/admin-login" className="hover:text-[var(--ink)]">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
