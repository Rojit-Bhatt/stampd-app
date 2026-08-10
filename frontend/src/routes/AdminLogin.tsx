import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "react-router-dom";
import toast from "@/lib/toast";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";
import { PLATFORM_NAME } from "../lib/platform";
import { AuthSplitShell } from "../components/shared/auth/AuthSplitShell";
import { VerifyCodeCard } from "../components/shared/auth/VerifyCodeCard";
import { Turnstile, TURNSTILE_ENABLED, type TurnstileHandle } from "../components/shared/Turnstile";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});
type FormValues = z.infer<typeof schema>;

interface LoginResponse {
  success: boolean;
  kind: "company_owner" | "outlet_admin";
  token: string;
  account?: { id: string; name: string; email: string };
  user?: { id: string; name: string; role: string; organizationId: string };
  company: { slug: string; name: string };
  outlet?: { slug: string; name: string };
}

// The one sign-in form for everyone on the business side. There is no
// "find your business" step and no slug in the URL: the credentials alone
// decide whether you're a company owner or a single outlet's admin, and the
// backend hands back whichever session applies.
export default function AdminLogin() {

  useEffect(() => {
    document.title = `Business sign in | ${PLATFORM_NAME}`;
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Set only on NEEDS_VERIFICATION — the one case where "try again" isn't
  // the fix. Holds the credentials so onVerified can complete the sign-in
  // the admin was already mid-way through, without retyping anything.
  const [pendingVerify, setPendingVerify] = useState<{ email: string; password: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  const onSubmit = async (data: FormValues) => {
    const id = toast.loading("Signing you in…");
    try {
      const res = await apiRequest<LoginResponse>("/api/admin-auth/login", {
        method: "POST",
        body: { email: data.email, password: data.password, turnstileToken },
      });

      // Someone can legitimately move between roles, so clear the other
      // staff session before writing this one — otherwise a stale token
      // could strand them in the wrong console.
      localStorage.removeItem("company_session");
      localStorage.removeItem("company_account");
      localStorage.removeItem("company_info");
      localStorage.removeItem("admin_auth_token");
      localStorage.removeItem("admin_auth_user");

      if (res.kind === "company_owner") {
        localStorage.setItem("company_session", res.token);
        localStorage.setItem("company_account", JSON.stringify(res.account));
        localStorage.setItem("company_info", JSON.stringify(res.company));
        toast.success(`Welcome back, ${res.company.name}!`, { id });
        window.location.href = "/company";
        return;
      }

      localStorage.setItem("admin_auth_token", res.token);
      localStorage.setItem("admin_auth_user", JSON.stringify(res.user));
      toast.success(`Welcome back, ${res.outlet?.name}!`, { id });
      window.location.href = tenantPath(res.company.slug, res.outlet!.slug, "admin");
    } catch (err: any) {
      if (err.code === "NEEDS_VERIFICATION") {
        toast.dismiss(id);
        setPendingVerify({ email: data.email, password: data.password });
        return;
      }
      turnstileRef.current?.reset();
      setTurnstileToken("");
      toast.error(err.message || "Couldn't sign you in — try again.", { id });
    }
  };

  const verifyOtp = async (code: string) => {
    await apiRequest("/api/admin-auth/verify-otp", {
      method: "POST",
      body: { email: pendingVerify!.email, code },
    });
  };

  const resendOtp = async () => {
    await apiRequest("/api/admin-auth/resend-verification", {
      method: "POST",
      body: { email: pendingVerify!.email },
    });
  };

  const onVerified = () => {
    toast.success("Email verified — signing you in…");
    const creds = pendingVerify!;
    setPendingVerify(null);
    onSubmit({ email: creds.email, password: creds.password });
  };

  return (
    <AuthSplitShell>
      {pendingVerify ? (
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--lp-ink)]">Check your email</h1>
          <p className="mt-1 text-sm text-[var(--lp-muted)]">One more step before you're in.</p>
          <div className="mt-6">
            <VerifyCodeCard
              size="full"
              email={pendingVerify.email}
              verify={verifyOtp}
              resend={resendOtp}
              onVerified={onVerified}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-bold text-[var(--lp-ink)]">Business sign in</h1>
            <p className="mt-1 text-sm text-[var(--lp-muted)]">
              For company owners and outlet staff alike.
            </p>
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
                disabled={isSubmitting || (TURNSTILE_ENABLED && !turnstileToken)}
                className="mt-2 w-full rounded-[74px] bg-[var(--lp-cream)] py-4 text-[15px] font-bold text-[#14201C] transition-transform duration-200 hover:scale-105 disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:scale-100"
              >
                {isSubmitting ? "Signing you in…" : "Sign in"}
              </button>
            </form>

            <p className="mt-4 text-center text-[13px] text-[var(--lp-muted)]">
              <Link to="/admin-forgot-password" className="hover:text-[var(--lp-ink)]">Forgot password?</Link>
            </p>
          </div>

          <p className="mt-5 text-center text-[13px] text-[var(--lp-muted)]">
            Want to bring your business onto {PLATFORM_NAME}?{" "}
            <Link to="/" className="font-bold text-[var(--lp-green)] hover:underline">Get in touch</Link>
          </p>
          <p className="mt-2.5 text-center text-[13px] text-[var(--lp-muted)]">
            <Link to="/login" className="hover:text-[var(--lp-ink)]">← Back</Link>
          </p>
        </>
      )}
    </AuthSplitShell>
  );
}
