import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useTenant } from "../../context/TenantContext";
import toast from "react-hot-toast";

type Mode = "login" | "register";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

export function AuthView({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { slug, tenant } = useTenant();
  const { user, login, registerUser } = useCustomerAuth();
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = mode === "login";
  const initial = (tenant?.name || "?").charAt(0).toUpperCase();

  useEffect(() => {
    if (user && user.role === "customer") {
      navigate(`/${slug}/dashboard`);
    }
  }, [user, navigate, slug]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onLoginSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Signing in…");
    try {
      await login(data.email, data.password);
      toast.success("Welcome back!", { id: toastId });
      navigate(`/${slug}/dashboard`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to sign in.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Creating your account…");
    try {
      await registerUser(data.name, data.email, data.password);
      toast.success("Account created! Please sign in.", { id: toastId });
      navigate(`/${slug}/login`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to register.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-[17px] font-display text-[22px] font-extrabold text-white"
          style={{ background: "var(--brand)" }}
        >
          {initial}
        </div>
        <h1 className="font-display text-[25px] font-extrabold text-[var(--ink)]">
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

        <p className="mt-6 text-center text-[13px] text-[var(--muted)]">
          {isLogin ? "New here? " : "Already a member? "}
          <Link
            to={isLogin ? `/${slug}/register` : `/${slug}/login`}
            className="font-bold text-[var(--brand)] hover:underline"
          >
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </p>
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
      <div className="flex items-center gap-3 rounded-[13px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 transition-colors focus-within:border-[var(--brand)]">
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
    <button
      type="submit"
      disabled={loading}
      className="mt-2 w-full rounded-[15px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: "var(--brand)" }}
    >
      {loading ? "Please wait…" : label}
    </button>
  );
}

export default AuthView;
