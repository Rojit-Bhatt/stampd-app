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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: { email } });
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
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
            />
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
