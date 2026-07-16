import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, User, Phone } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import toast from "react-hot-toast";
import { useOwnerAuth } from "../../context/OwnerAuthContext";
import { apiRequest } from "../../lib/api";
import { PLATFORM_NAME } from "../../lib/platform";
import { StampdLogo } from "../../components/shared/StampdLogo";
import { TRIAL_DAYS } from "../../lib/subscription";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  phone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").replace(/^0+/, "").length >= 7, "Enter a valid phone number."),
});
type FormValues = z.infer<typeof schema>;

export default function OwnerRegister() {
  const { registerOwner } = useOwnerAuth();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", phone: "" },
  });

  const onSubmit = async (data: FormValues) => {
    const id = toast.loading("Setting up your account…");
    try {
      const local = data.phone.replace(/\D/g, "").replace(/^0+/, "");
      await registerOwner(data.name, data.email, data.password, `+977${local}`);
      toast.success("You're in! Check your email to verify.", { id });
      setRegisteredEmail(data.email);
    } catch (err: any) {
      toast.error(err.message || "Couldn't create your account — try again.", { id });
    }
  };

  if (registeredEmail) {
    return (
      <Shell>
        <h1 className="font-display text-[25px] font-extrabold text-[var(--ink)]">Check your email</h1>
        <p className="mb-6 mt-2 text-sm text-[var(--muted)]">
          We sent a verification link to <b className="text-[var(--ink)]">{registeredEmail}</b>. Verify it, then
          sign in to start your {TRIAL_DAYS}-day trial and add your first business.
        </p>
        <button
          onClick={async () => {
            try {
              await apiRequest("/api/owner/resend-verification", { method: "POST", body: { email: registeredEmail } });
              toast.success("Verification email sent — check your inbox.");
            } catch {
              toast.error("Couldn't resend that — try again in a bit.");
            }
          }}
          className="w-full rounded-[15px] py-4 text-[15px] font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          Resend email
        </button>
        <p className="mt-6 text-center text-[13px] text-[var(--muted)]">
          <Link to="/owner-login" className="font-bold text-[var(--brand)] hover:underline">Go to sign in</Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-[25px] font-extrabold text-[var(--ink)]">Start your business on {PLATFORM_NAME}</h1>
      <p className="mb-6 mt-1 text-sm text-[var(--muted)]">
        {TRIAL_DAYS} days free, one business included. Add more any time.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <Field label="Your name" icon={<User className="h-4 w-4 text-[var(--soft)]" />}>
          <input type="text" placeholder="Your name" {...register("name")} className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none" />
        </Field>
        {errors.name && <Err msg={errors.name.message} />}

        <Field label="Email" icon={<Mail className="h-4 w-4 text-[var(--soft)]" />}>
          <input type="email" placeholder="you@email.com" {...register("email")} className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none" />
        </Field>
        {errors.email && <Err msg={errors.email.message} />}

        <Field label="Phone" icon={<Phone className="h-4 w-4 text-[var(--soft)]" />}>
          <span className="text-sm text-[var(--soft)]">+977</span>
          <input type="tel" inputMode="numeric" placeholder="98XXXXXXXX" {...register("phone")} className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none" />
        </Field>
        {errors.phone && <Err msg={errors.phone.message} />}

        <Field label="Password" icon={<Lock className="h-4 w-4 text-[var(--soft)]" />}>
          <input type="password" placeholder="••••••••" {...register("password")} className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none" />
        </Field>
        {errors.password && <Err msg={errors.password.message} />}

        <button
          type="submit"
          disabled={isSubmitting}
          className="stamp-interactive mt-2 w-full rounded-full py-4 text-[15px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {isSubmitting ? "Please wait…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[var(--muted)]">
        Already have an account?{" "}
        <Link to="/owner-login" className="font-bold text-[var(--brand)] hover:underline">Sign in</Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <StampdLogo size={56} tile className="mb-4" />
        {children}
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
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
