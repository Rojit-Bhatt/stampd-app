import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { GoogleLogin } from "@react-oauth/google";
import toast from "react-hot-toast";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { PhoneStepModal } from "../components/customer/PhoneStepModal";
import { StampdLogo } from "../components/shared/StampdLogo";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});
type LoginFormValues = z.infer<typeof loginSchema>;

// Slug-less global sign-in — no "which business" step. Customer identity is
// global (one CustomerAccount works at every tenant); on success this lands
// on /explore, the cross-tenant directory/home.
export default function GlobalCustomerLogin() {
  const navigate = useNavigate();
  const { globalAccount, login, loginWithGoogle } = useCustomerAuth();
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPhoneStep, setShowPhoneStep] = useState(false);

  useEffect(() => {
    if (globalAccount) navigate("/explore");
  }, [globalAccount, navigate]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Signing you in…");
    try {
      await login(data.email, data.password);
      toast.success("Good to see you again!", { id: toastId });
      navigate("/explore");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't sign you in — try again.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onGoogle = async (credential?: string) => {
    if (!credential) return;
    try {
      const { needsPhone } = await loginWithGoogle(credential);
      if (needsPhone) setShowPhoneStep(true);
      else navigate("/explore");
    } catch (err) {
      toast.error((err as Error).message || "Google sign-in didn't work — try again.");
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <StampdLogo size={56} tile className="mb-4" />

        <h1 className="font-display text-[25px] font-bold text-[var(--ink)]">Welcome back</h1>
        <p className="mb-6 mt-1 text-sm text-[var(--muted)]">
          Sign in once to see every business you're a member of.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink)]">Email</span>
            <div className="flex items-center gap-3 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 transition-colors focus-within:border-[var(--primary)]">
              <Mail className="h-4 w-4 text-[var(--soft)]" />
              <input
                type="email"
                placeholder="you@email.com"
                {...register("email")}
                className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
              />
            </div>
          </label>
          {errors.email && <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.email.message}</p>}

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink)]">Password</span>
            <div className="flex items-center gap-3 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 transition-colors focus-within:border-[var(--primary)]">
              <Lock className="h-4 w-4 text-[var(--soft)]" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                {...register("password")}
                className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="text-[var(--soft)] hover:text-[var(--ink)] focus:outline-none"
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          {errors.password && <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.password.message}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="stamp-interactive mt-2 w-full rounded-full py-4 text-[15px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--primary)" }}
          >
            {isSubmitting ? "Please wait…" : "Sign in"}
          </button>
        </form>

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
          New here?{" "}
          <Link to="/customer-register" className="font-bold text-[var(--primary-deep)] hover:underline">
            Create an account
          </Link>
        </p>

        {showPhoneStep && <PhoneStepModal onDone={() => navigate("/explore")} />}
      </div>
    </div>
  );
}
