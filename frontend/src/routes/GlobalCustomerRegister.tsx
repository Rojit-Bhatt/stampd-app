import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Phone } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import toast from "@/lib/toast";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { PLATFORM_NAME } from "../lib/platform";
import { AuthSplitShell } from "../components/shared/auth/AuthSplitShell";
import { ErrorInput } from "../components/shared/ErrorInput";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  phone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").replace(/^0+/, "").length >= 7, "Enter a valid phone number."),
  agreeTerms: z.boolean().refine((v) => v === true, "You must agree to the terms to continue."),
});
type RegisterFormValues = z.infer<typeof registerSchema>;

// Slug-less global signup — mirrors AuthView.tsx's register half + its
// "check your email" interstitial. Registering doesn't log in (registerAccount
// only sends a verification email), matching the existing per-tenant UX.
//
// Visual redesign only — verification stays deferred here (the account can
// browse and earn unverified; only redeeming is gated), so there is no OTP
// step at signup. That happens wherever verification IS later triggered —
// see CustomerDashboard.tsx, CustomerProfilePanel.tsx, RedeemLanding.tsx.
export default function GlobalCustomerRegister() {
  const navigate = useNavigate();
  const { registerUser } = useCustomerAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", phone: "", agreeTerms: false },
  });
  const { register, handleSubmit, formState } = form;
  // After a failed submit every invalid field surfaces at once; until then
  // only touched fields do (blur-gated inline errors).
  const submitted = useRef(false);

  const onSubmit = async (data: RegisterFormValues) => {
    submitted.current = true;
    setIsSubmitting(true);
    const toastId = toast.loading("Setting up your account…");
    try {
      const local = data.phone.replace(/\D/g, "").replace(/^0+/, "");
      await registerUser({
        name: data.name, email: data.email, password: data.password, phone: `+977${local}`,
      });
      toast.success("Welcome! You can verify your email later before redeeming.", { id: toastId });
      navigate("/explore");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't create your account — try again.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Shell>
      <h1 className="font-display text-[25px] font-bold text-[var(--lp-ink)]">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-[var(--lp-muted)]">
        One account works at every business on {PLATFORM_NAME}.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <ErrorInput
          label="Full name"
          id="global-register-name"
          error={formState.errors.name?.message}
          touched={!!formState.touchedFields.name}
          forced={submitted.current}
          icon={<User className="h-4 w-4 text-[var(--lp-muted)]" />}
          className="bg-white/[0.04]"
        >
          <input
            type="text"
            placeholder="Your name"
            autoComplete="name"
            {...register("name")}
            aria-invalid={!!formState.errors.name}
            aria-describedby={formState.errors.name ? "global-register-name-error" : undefined}
            className="w-full bg-transparent text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:outline-none"
          />
        </ErrorInput>

        <ErrorInput
          label="Email"
          id="global-register-email"
          error={formState.errors.email?.message}
          touched={!!formState.touchedFields.email}
          forced={submitted.current}
          icon={<Mail className="h-4 w-4 text-[var(--lp-muted)]" />}
          className="bg-white/[0.04]"
        >
          <input
            type="email"
            placeholder="you@email.com"
            autoComplete="email"
            {...register("email")}
            aria-invalid={!!formState.errors.email}
            aria-describedby={formState.errors.email ? "global-register-email-error" : undefined}
            className="w-full bg-transparent text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:outline-none"
          />
        </ErrorInput>

        <ErrorInput
          label="Phone"
          id="global-register-phone"
          error={formState.errors.phone?.message}
          touched={!!formState.touchedFields.phone}
          forced={submitted.current}
          icon={<Phone className="h-4 w-4 text-[var(--lp-muted)]" />}
          className="bg-white/[0.04]"
        >
          <span className="text-sm text-[var(--lp-muted)]">+977</span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="98XXXXXXXX"
            autoComplete="tel-local"
            {...register("phone")}
            aria-invalid={!!formState.errors.phone}
            aria-describedby={formState.errors.phone ? "global-register-phone-error" : undefined}
            className="w-full bg-transparent text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:outline-none"
          />
        </ErrorInput>

        <ErrorInput
          label="Password"
          id="global-register-password"
          error={formState.errors.password?.message}
          touched={!!formState.touchedFields.password}
          forced={submitted.current}
          icon={<Lock className="h-4 w-4 text-[var(--lp-muted)]" />}
          className="bg-white/[0.04]"
        >
          <input
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("password")}
            aria-invalid={!!formState.errors.password}
            aria-describedby={formState.errors.password ? "global-register-password-error" : undefined}
            className="w-full bg-transparent text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:outline-none"
          />
        </ErrorInput>

        <label className="mt-1 flex items-start gap-2.5 text-[13px] text-[var(--lp-muted)]">
          <input
            type="checkbox"
            {...register("agreeTerms")}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--lp-line)] bg-white/[0.04] accent-[var(--lp-green)]"
          />
          <span>
            I agree to the{" "}
            <Link to="/terms" target="_blank" className="font-semibold text-[var(--lp-green)] hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" target="_blank" className="font-semibold text-[var(--lp-green)] hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {formState.errors.agreeTerms && (
          <p
            id="global-register-agree-error"
            role="alert"
            className="pl-1 text-xs font-semibold text-[var(--lp-terra)]"
            aria-live="assertive"
          >
            {formState.errors.agreeTerms.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full rounded-[74px] bg-[var(--lp-cream)] py-4 text-[15px] font-bold text-[#14201C] transition-transform duration-200 hover:scale-105 disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          {isSubmitting ? "Please wait…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[var(--lp-muted)]">
        Already a member?{" "}
        <Link to="/customer-login" className="font-bold text-[var(--lp-green)] hover:underline">
          Sign in
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <AuthSplitShell>{children}</AuthSplitShell>;
}

// Field was retired in favor of the shared <ErrorInput> (Task 10), which adds
// touched/blur-gating, red borders, and aria-describedby wiring.

