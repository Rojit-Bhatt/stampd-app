import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Phone, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { GoogleLogin } from "@react-oauth/google";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useTenant } from "../../context/TenantContext";
import { apiRequest } from "../../lib/api";
import { PhoneStepModal } from "./PhoneStepModal";
import toast from "react-hot-toast";
import { tenantPath } from "../../lib/tenantPath";
import { Button } from "@/components/ui/button";

type Mode = "login" | "register";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  phone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").replace(/^0+/, "").length >= 7, "Enter a valid phone number."),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export function AuthView({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { companySlug, slug, tenant } = useTenant();
  const { user, login, registerUser, loginWithGoogle, ensureTenantSession } = useCustomerAuth();
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [showPhoneStep, setShowPhoneStep] = useState(false);

  const isLogin = mode === "login";
  const initial = (tenant?.name || "?").charAt(0).toUpperCase();

  useEffect(() => {
    if (user && user.role === "customer") {
      navigate(tenantPath(companySlug, slug, "dashboard"));
    }
  }, [user, navigate, slug]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", phone: "" },
  });

  const onLoginSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Signing you in…");
    try {
      await login(data.email, data.password);
      await ensureTenantSession(slug, tenant?.id ?? null);
      toast.success("Good to see you again!", { id: toastId });
      navigate(tenantPath(companySlug, slug, "dashboard"));
    } catch (err) {
      toast.error((err as Error).message || "Couldn't sign you in — try again.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Setting up your account…");
    try {
      const local = data.phone.replace(/\D/g, "").replace(/^0+/, "");
      await registerUser(data.name, data.email, data.password, `+977${local}`);
      toast.success("You're in! Check your email to verify.", { id: toastId });
      setRegisteredEmail(data.email);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't create your account — try again.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onGoogle = async (credential?: string) => {
    if (!credential) return;
    try {
      const { needsPhone } = await loginWithGoogle(credential);
      await ensureTenantSession(slug, tenant?.id ?? null);
      if (needsPhone) setShowPhoneStep(true);
      else navigate(tenantPath(companySlug, slug, "dashboard"));
    } catch (err) {
      toast.error((err as Error).message || "Google sign-in didn't work — try again.");
    }
  };

  // Post-register "check your email" panel.
  if (registeredEmail) {
    return (
      <Shell initial={initial}>
        <h1 className="font-display text-[25px] font-bold text-[var(--ink)]">Check your email</h1>
        <p className="mb-6 mt-2 text-sm text-[var(--muted)]">
          We sent a verification link to <b className="text-[var(--ink)]">{registeredEmail}</b>. Open it
          to start collecting points.
        </p>
        <Button
          onClick={async () => {
            try {
              await apiRequest("/api/customer-auth/resend-verification", {
                method: "POST",
                body: { email: registeredEmail },
              });
              toast.success("Verification email sent — check your inbox.");
            } catch {
              toast.error("Couldn't resend that — try again in a bit.");
            }
          }}
          className="w-full"
          size="lg"
        >
          Resend email
        </Button>
        <p className="mt-6 text-center text-[13px] text-[var(--muted)]">
          <Link to={tenantPath(companySlug, slug, "login")} className="font-bold text-[var(--primary-deep)] hover:underline">
            Go to sign in
          </Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell initial={initial}>
      <h1 className="font-display text-[25px] font-bold text-[var(--ink)]">
        {isLogin ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mb-6 mt-1 text-sm text-[var(--muted)]">
        Your {tenant?.name} loyalty card lives here.
      </p>

      {isLogin ? (
        <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="flex flex-col gap-3">
          <Field label="Email" icon={<Mail className="h-4 w-4 text-[var(--soft)]" />}>
            <input
              type="email"
              placeholder="you@email.com"
              {...loginForm.register("email")}
              className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
            />
          </Field>
          {loginForm.formState.errors.email && <Err msg={loginForm.formState.errors.email.message} />}

          <Field label="Password" icon={<Lock className="h-4 w-4 text-[var(--soft)]" />}>
            <input
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              {...loginForm.register("password")}
              className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
            />
            <EyeToggle show={showPass} onClick={() => setShowPass((v) => !v)} />
          </Field>
          {loginForm.formState.errors.password && (
            <Err msg={loginForm.formState.errors.password.message} />
          )}

          <div className="text-right">
            <Link
              to={tenantPath(companySlug, slug, "forgot-password")}
              className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Forgot password?
            </Link>
          </div>

          <SubmitButton loading={isSubmitting} label="Sign in" />
        </form>
      ) : (
        <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="flex flex-col gap-3">
          <Field label="Full name" icon={<User className="h-4 w-4 text-[var(--soft)]" />}>
            <input
              type="text"
              placeholder="Your name"
              {...registerForm.register("name")}
              className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
            />
          </Field>
          {registerForm.formState.errors.name && <Err msg={registerForm.formState.errors.name.message} />}

          <Field label="Email" icon={<Mail className="h-4 w-4 text-[var(--soft)]" />}>
            <input
              type="email"
              placeholder="you@email.com"
              {...registerForm.register("email")}
              className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
            />
          </Field>
          {registerForm.formState.errors.email && (
            <Err msg={registerForm.formState.errors.email.message} />
          )}

          <Field label="Phone" icon={<Phone className="h-4 w-4 text-[var(--soft)]" />}>
            <span className="text-sm text-[var(--soft)]">+977</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="98XXXXXXXX"
              {...registerForm.register("phone")}
              className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
            />
          </Field>
          {registerForm.formState.errors.phone && (
            <Err msg={registerForm.formState.errors.phone.message} />
          )}

          <Field label="Password" icon={<Lock className="h-4 w-4 text-[var(--soft)]" />}>
            <input
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              {...registerForm.register("password")}
              className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
            />
            <EyeToggle show={showPass} onClick={() => setShowPass((v) => !v)} />
          </Field>
          {registerForm.formState.errors.password && (
            <Err msg={registerForm.formState.errors.password.message} />
          )}

          <SubmitButton loading={isSubmitting} label="Create account" />
        </form>
      )}

      {GOOGLE_CLIENT_ID && (
        <div className="mt-5">
          <div className="mb-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--soft)]">
            <span className="h-px flex-1 bg-[var(--line)]" /> or <span className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <div className="flex justify-center">
            <GoogleLogin onSuccess={(cred) => onGoogle(cred.credential)} onError={() => toast.error("Google sign-in didn't work — try again.")} />
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-[13px] text-[var(--muted)]">
        {isLogin ? "New here? " : "Already a member? "}
        <Link
          to={isLogin ? tenantPath(companySlug, slug, "register") : tenantPath(companySlug, slug, "login")}
          className="font-bold text-[var(--primary-deep)] hover:underline"
        >
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>

      {showPhoneStep && <PhoneStepModal onDone={() => navigate(tenantPath(companySlug, slug, "dashboard"))} />}
    </Shell>
  );
}

function Shell({ initial, children }: { initial: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] font-display text-[22px] font-bold"
          style={{ background: "var(--brand)", color: "var(--brand-on)" }}
        >
          {initial}
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink)]">{label}</span>
      <div className="flex items-center gap-3 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 transition-colors focus-within:border-[var(--primary)]">
        <span>{icon}</span>
        {children}
      </div>
    </label>
  );
}

function Err({ msg }: { msg?: string }) {
  return <p className="pl-1 text-xs font-semibold text-[var(--err)]">{msg}</p>;
}

function EyeToggle({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[var(--soft)] hover:text-[var(--ink)] focus:outline-none"
      aria-label={show ? "Hide password" : "Show password"}
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <Button type="submit" disabled={loading} size="lg" className="mt-2 w-full">
      {loading ? "Please wait…" : label}
    </Button>
  );
}

export default AuthView;
