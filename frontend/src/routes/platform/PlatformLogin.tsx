import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { usePlatformAuth } from "../../context/PlatformAuthContext";
import { PLATFORM_NAME } from "../../lib/platform";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});
type FormValues = z.infer<typeof schema>;

export default function PlatformLogin() {
  const { user, login, isLoading } = usePlatformAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `Platform admin | ${PLATFORM_NAME}`;
  }, []);
  useEffect(() => {
    if (user && user.role === "platform") navigate("/platform");
  }, [user, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setBusy(true);
    const id = toast.loading("Signing in…");
    try {
      await login(data.email, data.password);
      toast.success("Welcome back!", { id });
      navigate("/platform");
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in.", { id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-[13px] font-display text-xl font-extrabold text-white"
            style={{ background: "var(--plat)" }}
          >
            {PLATFORM_NAME.charAt(0)}
          </div>
          <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Platform admin</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Sign in to your control panel</p>
        </div>

        <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              {...register("email")}
              className="rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--plat)] focus:outline-none"
            />
            {errors.email && (
              <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.email.message}</p>
            )}
            <input
              type="password"
              placeholder="Password"
              {...register("password")}
              className="rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-sm focus:border-[var(--plat)] focus:outline-none"
            />
            {errors.password && (
              <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.password.message}</p>
            )}
            <button
              type="submit"
              disabled={busy || isLoading}
              className="mt-2 w-full rounded-[13px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--plat)" }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center">
          <Link to="/" className="text-[13px] text-[var(--muted)] hover:text-[var(--ink)]">
            ← Back to {PLATFORM_NAME}
          </Link>
        </div>
      </div>
    </div>
  );
}
