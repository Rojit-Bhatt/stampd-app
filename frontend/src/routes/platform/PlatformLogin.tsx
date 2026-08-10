import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate } from "react-router-dom";
import toast from "@/lib/toast";
import { usePlatformAuth } from "../../context/PlatformAuthContext";
import { PLATFORM_NAME } from "../../lib/platform";
import { AuthSplitShell } from "../../components/shared/auth/AuthSplitShell";
import { Turnstile, TURNSTILE_ENABLED, type TurnstileHandle } from "../../components/shared/Turnstile";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});
type FormValues = z.infer<typeof schema>;

// Same shell and card recipe as AdminLogin/GlobalCustomerLogin — the
// platform admin console is fixed-identity green, not tenant-themed, but the
// three login screens should still read as one product, not three.
export default function PlatformLogin() {
  const { user, login, isLoading } = usePlatformAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  useEffect(() => {
    document.title = `Platform admin | ${PLATFORM_NAME}`;
  }, []);
  useEffect(() => {
    if (user && user.role === "platform") navigate("/platform");
  }, [user, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setBusy(true);
    const id = toast.loading("Signing you in…");
    try {
      await login(data.email, data.password, turnstileToken);
      toast.success("Good to see you again!", { id });
      navigate("/platform");
    } catch (err: any) {
      turnstileRef.current?.reset();
      setTurnstileToken("");
      toast.error(err.message || "Couldn't sign you in — try again.", { id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthSplitShell>
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-[var(--lp-ink)]">Platform admin</h1>
        <p className="mt-1 text-sm text-[var(--lp-muted)]">Sign in to your control panel</p>
      </div>

      <div className="rounded-[20px] border border-[var(--lp-line)] bg-white/[0.04] p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            autoComplete="username"
            {...register("email")}
            className="rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3.5 text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-green)] focus:outline-none"
          />
          {errors.email && <p className="pl-1 text-xs font-semibold text-[var(--lp-terra)]">{errors.email.message}</p>}
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            {...register("password")}
            className="rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3.5 text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-green)] focus:outline-none"
          />
          {errors.password && <p className="pl-1 text-xs font-semibold text-[var(--lp-terra)]">{errors.password.message}</p>}
          <Turnstile ref={turnstileRef} onVerify={setTurnstileToken} />
          <button
            type="submit"
            disabled={busy || isLoading || (TURNSTILE_ENABLED && !turnstileToken)}
            className="mt-2 w-full rounded-[74px] bg-[var(--lp-cream)] py-4 text-[15px] font-bold text-[#14201C] transition-transform duration-200 hover:scale-105 disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            {busy ? "Signing you in…" : "Sign in"}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-[13px] text-[var(--lp-muted)]">
        <Link to="/login" className="hover:text-[var(--lp-ink)]">← Back</Link>
      </p>
    </AuthSplitShell>
  );
}
