import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { StampdLogo } from "../../components/shared/StampdLogo";

export default function OwnerResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest("/api/owner/reset-password", { method: "POST", body: { token, password } });
      toast.success("Password updated — sign in to continue.");
      navigate("/owner-login");
    } catch (err: any) {
      toast.error(err.message || "Couldn't reset your password — the link may have expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <StampdLogo size={44} tile className="mx-auto mb-4" />
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <h1 className="font-display text-lg font-bold text-[var(--ink)]">Set a new password</h1>
            <input
              type="password"
              required
              minLength={6}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-[13px] py-3.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {busy ? "Saving…" : "Save password"}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-[13px] text-[var(--muted)]">
          <Link to="/owner-login" className="hover:text-[var(--ink)]">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
