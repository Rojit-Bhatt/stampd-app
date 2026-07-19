import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
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

  useEffect(() => {
    document.title = `Set a new password | ${PLATFORM_NAME}`;
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Those two passwords don't match.");
      return;
    }

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
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
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
