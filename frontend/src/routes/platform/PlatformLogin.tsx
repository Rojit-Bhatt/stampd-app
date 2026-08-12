import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate } from "react-router-dom";
import toast from "@/lib/toast";
import { usePlatformAuth } from "../../context/PlatformAuthContext";
import { PLATFORM_NAME } from "../../lib/platform";
import { AuthSplitShell } from "../../components/shared/auth/AuthSplitShell";
import { ErrorInput } from "../../components/shared/ErrorInput";
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

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = form;
  // Wrong-credential errors point at both fields (never reveal which side
  // misfired) and clear the moment the admin starts typing again.
  const [serverError, setServerError] = useState<string | null>(null);
  const submitted = useRef(false);

  const onSubmit = async (data: FormValues) => {
    submitted.current = true;
    setServerError(null);
    setBusy(true);
    const id = toast.loading("Signing you in…");
    try {
      await login(data.email, data.password, turnstileToken);
      toast.success("Good to see you again!", { id });
      navigate("/platform");
    } catch (err: any) {
      turnstileRef.current?.reset();
      setTurnstileToken("");
      const msg = err.message || "Couldn't sign you in — try again.";
      setServerError(msg);
      toast.error(msg, { id });
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
          <ErrorInput
            label="Email"
            id="platform-login-email"
            error={serverError ?? errors.email?.message}
            touched={!!touchedFields.email || !!serverError}
            forced={submitted.current || !!serverError}
            className="bg-white/[0.04]"
          >
            <input
              type="email"
              placeholder="Email"
              autoComplete="username"
              {...register("email", { onChange: () => setServerError(null) })}
              aria-invalid={!!(serverError || errors.email)}
              aria-describedby={serverError || errors.email ? "platform-login-email-error" : undefined}
              className="w-full bg-transparent px-0 text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:outline-none"
            />
          </ErrorInput>
          <ErrorInput
            label="Password"
            id="platform-login-password"
            error={serverError ?? errors.password?.message}
            touched={!!touchedFields.password || !!serverError}
            forced={submitted.current || !!serverError}
            className="bg-white/[0.04]"
          >
            <input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              {...register("password", { onChange: () => setServerError(null) })}
              aria-invalid={!!(serverError || errors.password)}
              aria-describedby={serverError || errors.password ? "platform-login-password-error" : undefined}
              className="w-full bg-transparent px-0 text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:outline-none"
            />
          </ErrorInput>
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
