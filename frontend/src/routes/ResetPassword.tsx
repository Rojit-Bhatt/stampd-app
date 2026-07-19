import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Needs to be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Those passwords don't match.");
      return;
    }
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
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
          />
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
