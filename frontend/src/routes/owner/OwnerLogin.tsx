import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useOwnerAuth } from "../../context/OwnerAuthContext";
import { PLATFORM_NAME } from "../../lib/platform";
import { StampdLogo } from "../../components/shared/StampdLogo";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});
type FormValues = z.infer<typeof schema>;

export default function OwnerLogin() {
  const { account, login } = useOwnerAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (account) navigate("/owner");
  }, [account, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    const id = toast.loading("Signing you in…");
    try {
      await login(data.email, data.password);
      toast.success("Welcome back!", { id });
      navigate("/owner");
    } catch (err: any) {
      toast.error(err.message || "Couldn't sign you in — try again.", { id });
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <StampdLogo size={44} tile className="mx-auto mb-3.5" />
          <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Business owner</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Manage every business you run on {PLATFORM_NAME}</p>
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              {...register("email")}
              className="rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            {errors.email && <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.email.message}</p>}
            <input
              type="password"
              placeholder="Password"
              {...register("password")}
              className="rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            {errors.password && <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.password.message}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-[13px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {isSubmitting ? "Signing you in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
            <Link to="/owner-forgot-password" className="hover:text-[var(--ink)]">Forgot password?</Link>
          </p>
        </div>

        <p className="mt-5 text-center text-[13px] text-[var(--muted)]">
          New business owner?{" "}
          <Link to="/owner-register" className="font-bold text-[var(--brand)] hover:underline">
            Create an account
          </Link>
        </p>
        <div className="mt-5 text-center">
          <Link to="/" className="text-[13px] text-[var(--muted)] hover:text-[var(--ink)]">
            ← Back to {PLATFORM_NAME}
          </Link>
        </div>
      </div>
    </div>
  );
}
