import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../lib/api";

export default function ResetPassword() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    const token = params.get("token");
    setBusy(true);
    try {
      await apiRequest("/api/auth/reset-password", { method: "POST", body: { token, password } });
      toast.success("Password updated. Please sign in.");
      navigate(`/${slug}/login`);
    } catch (err) {
      toast.error((err as Error).message || "Reset failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <h2 className="font-display text-[22px] font-extrabold text-[var(--ink)]">Choose a new password</h2>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="rounded-[13px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm text-[var(--ink)] focus:border-[var(--brand)] focus:outline-none"
          />
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            className="rounded-[13px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm text-[var(--ink)] focus:border-[var(--brand)] focus:outline-none"
          />
          <button
            disabled={busy}
            className="rounded-[15px] py-4 text-[15px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
