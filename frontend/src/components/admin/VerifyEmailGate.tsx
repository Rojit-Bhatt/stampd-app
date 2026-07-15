import { useState } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { MailWarning, LogOut } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAccount } from "../../hooks/useAccount";

export function VerifyEmailGate() {
  const qc = useQueryClient();
  const { logout } = useAdminAuth();
  const { data: account } = useAccount("admin");
  const [resending, setResending] = useState(false);

  const resend = async () => {
    if (!account?.email) return;
    setResending(true);
    try {
      await apiRequest("/api/auth/resend-verification", { method: "POST", body: { email: account.email } });
      toast.success("Verification email resent.");
    } catch {
      toast.error("Could not resend. Try again.");
    } finally {
      setResending(false);
    }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["adminSettings"] });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-sm rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
        <MailWarning className="mx-auto mb-4 h-10 w-10 text-[var(--warn)]" />
        <h2 className="font-display text-xl font-extrabold text-[var(--ink)]">Verify your email</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Check <span className="font-semibold text-[var(--ink)]">{account?.email}</span> for a verification link
          before using the admin console.
        </p>
        <button
          onClick={resend}
          disabled={resending}
          className="mt-5 w-full rounded-[13px] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {resending ? "Sending…" : "Resend verification email"}
        </button>
        <button
          onClick={refresh}
          className="mt-2.5 w-full rounded-[13px] border border-[var(--line)] bg-[var(--bg)] py-3 text-sm font-bold"
        >
          I've verified — refresh
        </button>
        <button
          onClick={logout}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </div>
  );
}
