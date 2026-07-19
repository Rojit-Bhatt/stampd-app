import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";
import { PLATFORM_NAME } from "../lib/platform";
import { StampdLogo } from "../components/shared/StampdLogo";

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

  // Set only on EMAIL_NOT_VERIFIED — the one case where "try again" isn't
  // the fix, and the admin needs a way to get a fresh link without anyone
  // having to reach into the database for them.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const resend = async () => {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      const res = await apiRequest<{ message: string }>("/api/admin-auth/resend-verification", {
        method: "POST",
        body: { email: unverifiedEmail },
      });
      toast.success(res.message || "If that account exists and needs verification, a new link was sent.");
    } catch (err: any) {
      toast.error(err.message || "Couldn't resend — try again.");
    } finally {
      setResending(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    setUnverifiedEmail(null);
    const id = toast.loading("Signing you in…");
    try {
      const res = await apiRequest<LoginResponse>("/api/admin-auth/login", {
        method: "POST",
        body: { email: data.email, password: data.password },
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
      if (err.code === "EMAIL_NOT_VERIFIED") {
        toast.error("Verify your email first — check your inbox for the link.", { id });
        setUnverifiedEmail(data.email);
        return;
      }
      toast.error(err.message || "Couldn't sign you in — try again.", { id });
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <StampdLogo size={44} tile className="mx-auto mb-3.5" />
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Business sign in</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            For company owners and outlet staff alike.
          </p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              autoComplete="username"
              {...register("email")}
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            {errors.email && <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.email.message}</p>}
            <input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              {...register("password")}
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            {errors.password && <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.password.message}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-[var(--radius-btn)] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {isSubmitting ? "Signing you in…" : "Sign in"}
            </button>
          </form>

          {unverifiedEmail && (
            <div className="mt-4 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] p-3.5 text-center text-[13px] text-[var(--muted)]">
              Didn't get the link, or it expired?{" "}
              <button
                type="button"
                onClick={resend}
                disabled={resending}
                className="font-bold text-[var(--primary-deep)] hover:underline disabled:opacity-50"
              >
                {resending ? "Sending…" : "Resend verification email"}
              </button>
            </div>
          )}

          <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
            <Link to="/admin-forgot-password" className="hover:text-[var(--ink)]">Forgot password?</Link>
          </p>
        </div>

        <p className="mt-5 text-center text-[13px] text-[var(--muted)]">
          Want to bring your business onto {PLATFORM_NAME}?{" "}
          <Link to="/" className="font-bold text-[var(--primary-deep)] hover:underline">Get in touch</Link>
        </p>
      </div>
    </div>
  );
}
