import { useState, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Coffee, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "../context/AuthContext";
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export function AuthView({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { user, login, registerUser } = useAuth();
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = mode === "login";

  // Redirect if user is already authenticated
  useEffect(() => {
    if (user) {
      if (user.role === "customer") {
        navigate({ to: "/dashboard" });
      } else {
        navigate({ to: "/dashboard" });
      }
    }
  }, [user, navigate]);

  // Set up forms
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
    const toastId = toast.loading("Logging into your account...");
    try {
      await login(data.email, data.password);
      toast.success("Welcome back!", { id: toastId });
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "Failed to login.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Creating your loyalty account...");
    try {
      await registerUser(data.name, data.email, data.password);
      toast.success("Registration successful! Please log in.", { id: toastId });
      navigate({ to: "/login" });
    } catch (err: any) {
      toast.error(err.message || "Failed to register.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#121212] font-sans text-[#EBE6DF]">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 pb-10 pt-14">
        {/* Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center border border-[#2D2D2D] bg-[#1A1A1A] rounded-[20px]">
            <Coffee className="h-6 w-6 text-[#EBE6DF]" strokeWidth={1.6} />
          </div>
          <h1
            className="mt-5 text-3xl leading-tight tracking-tight text-[#EBE6DF] font-serif font-normal"
          >
            Mansarowar
            <span className="italic"> Cafe</span>
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-px w-6 bg-[#2D2D2D]" />
            <span className="text-[10px] uppercase tracking-[0.28em] text-[#A3A3A3] font-bold">
              Loyalty Club
            </span>
            <span className="h-px w-6 bg-[#2D2D2D]" />
          </div>
        </div>

        {/* Card */}
        <div className="mt-10 border border-[#2D2D2D] bg-[#1A1A1A] p-6 rounded-[48px] overflow-hidden shadow-none">
          {/* Toggle */}
          <div className="grid grid-cols-2 border border-[#2D2D2D] bg-[#121212] p-1 text-sm font-medium rounded-[32px] overflow-hidden">
            <Link
              to="/login"
              className={`py-2 text-center transition-colors font-bold uppercase tracking-wider text-xs rounded-[28px] ${
                isLogin ? "bg-[#EBE6DF] text-black" : "bg-[#121212] text-[#A3A3A3] hover:text-[#EBE6DF]"
              }`}
            >
              Log in
            </Link>
            <Link
              to="/register"
              className={`py-2 text-center transition-colors font-bold uppercase tracking-wider text-xs rounded-[28px] ${
                !isLogin ? "bg-[#EBE6DF] text-black" : "bg-[#121212] text-[#A3A3A3] hover:text-[#EBE6DF]"
              }`}
            >
              Sign up
            </Link>
          </div>

          <div className="mt-6">
            <h2
              className="text-xl text-[#EBE6DF] font-serif font-normal"
            >
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-[#A3A3A3]">
              {isLogin
                ? "Sign in to collect your stamps."
                : "Join the club and earn your first stamp today."}
            </p>
          </div>

          <div className="mt-6">
            {isLogin ? (
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                <Field label="Email" icon={<Mail className="h-4 w-4 text-[#A3A3A3]" />}>
                  <input
                    type="email"
                    placeholder="you@mansarowar.cafe"
                    {...loginForm.register("email")}
                    className="w-full bg-transparent text-sm text-[#EBE6DF] placeholder:text-[#A3A3A3]/40 focus:outline-none"
                  />
                </Field>
                {loginForm.formState.errors.email && (
                  <p className="text-xs font-semibold text-red-500 pl-1">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}

                <Field label="Password" icon={<Lock className="h-4 w-4 text-[#A3A3A3]" />}>
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    {...loginForm.register("password")}
                    className="w-full bg-transparent text-sm text-[#EBE6DF] placeholder:text-[#A3A3A3]/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="text-[#A3A3A3] hover:text-[#EBE6DF] focus:outline-none"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </Field>
                {loginForm.formState.errors.password && (
                  <p className="text-xs font-semibold text-red-500 pl-1">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-medium text-[#A3A3A3] hover:text-[#EBE6DF]"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-4 w-full bg-[#EBE6DF] text-black py-4 font-sans font-semibold tracking-wide hover:opacity-90 disabled:opacity-50 uppercase tracking-widest rounded-full transition-transform duration-200 hover:scale-[1.02]"
                >
                  {isSubmitting ? "Logging in..." : "Log in"}
                </button>
              </form>
            ) : (
              <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                <Field label="Full name" icon={<User className="h-4 w-4 text-[#A3A3A3]" />}>
                  <input
                    type="text"
                    placeholder="Aarav Sharma"
                    {...registerForm.register("name")}
                    className="w-full bg-transparent text-sm text-[#EBE6DF] placeholder:text-[#A3A3A3]/40 focus:outline-none"
                  />
                </Field>
                {registerForm.formState.errors.name && (
                  <p className="text-xs font-semibold text-red-500 pl-1">
                    {registerForm.formState.errors.name.message}
                  </p>
                )}

                <Field label="Email" icon={<Mail className="h-4 w-4 text-[#A3A3A3]" />}>
                  <input
                    type="email"
                    placeholder="you@mansarowar.cafe"
                    {...registerForm.register("email")}
                    className="w-full bg-transparent text-sm text-[#EBE6DF] placeholder:text-[#A3A3A3]/40 focus:outline-none"
                  />
                </Field>
                {registerForm.formState.errors.email && (
                  <p className="text-xs font-semibold text-red-500 pl-1">
                    {registerForm.formState.errors.email.message}
                  </p>
                )}

                <Field label="Password" icon={<Lock className="h-4 w-4 text-[#A3A3A3]" />}>
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    {...registerForm.register("password")}
                    className="w-full bg-transparent text-sm text-[#EBE6DF] placeholder:text-[#A3A3A3]/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="text-[#A3A3A3] hover:text-[#EBE6DF] focus:outline-none"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </Field>
                {registerForm.formState.errors.password && (
                  <p className="text-xs font-semibold text-red-500 pl-1">
                    {registerForm.formState.errors.password.message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-4 w-full bg-[#EBE6DF] text-black py-4 font-sans font-semibold tracking-wide hover:opacity-90 disabled:opacity-50 uppercase tracking-widest rounded-full transition-transform duration-200 hover:scale-[1.02]"
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </button>
              </form>
            )}
          </div>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#2D2D2D]" />
            <span className="text-[10px] uppercase tracking-[0.22em] text-[#A3A3A3] font-bold">
              or continue with
            </span>
            <span className="h-px flex-1 bg-[#2D2D2D]" />
          </div>

          {/* Google button */}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-3 border border-[#2D2D2D] bg-[#121212] py-3 text-sm font-bold text-[#EBE6DF] hover:bg-[#EBE6DF] hover:text-black transition-colors rounded-full uppercase tracking-wider text-xs"
          >
            <GoogleIcon />
            <span>Sign in with Google</span>
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-[#A3A3A3]">
          {isLogin ? "New to Mansarowar? " : "Already have an account? "}
          <Link
            to={isLogin ? "/register" : "/login"}
            className="font-bold text-[#EBE6DF] hover:underline"
          >
            {isLogin ? "Create an account" : "Log in"}
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
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#A3A3A3]">
        {label}
      </span>
      <div className="flex items-center gap-3 border border-[#2D2D2D] bg-[#121212] px-4 py-3.5 transition-colors focus-within:border-[#EBE6DF] rounded-[32px] overflow-hidden">
        <span>{icon}</span>
        {children}
      </div>
    </label>
  );
}
