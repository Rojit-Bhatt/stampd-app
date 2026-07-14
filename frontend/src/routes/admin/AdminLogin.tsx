import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useTenant } from "@/context/TenantContext";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});
type LoginFormValues = z.infer<typeof loginSchema>;

export default function AdminLogin() {
  const { user, login, isLoading } = useAdminAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const { slug } = useParams();
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const consolePath = slug ? `/${slug}/admin` : "/";
  const initial = (tenant?.name || "?").charAt(0).toUpperCase();

  useEffect(() => {
    document.title = "Staff Login | Stampd";
  }, []);

  useEffect(() => {
    if (user && user.role === "business_admin") navigate(consolePath);
  }, [user, navigate, consolePath]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Signing in…");
    try {
      await login(data.email, data.password);
      toast.success("Welcome to your console!", { id: toastId });
      navigate(consolePath);
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-3.5 flex h-13 w-13 items-center justify-center rounded-[15px] font-display text-[22px] font-extrabold text-white"
            style={{ width: 52, height: 52, background: "var(--brand)" }}
          >
            {initial}
          </div>
          <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">
            {tenant?.name} · Staff
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Barista &amp; owner console</p>
        </div>

        <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 focus-within:border-[var(--brand)]">
              <Mail className="h-4 w-4 text-[var(--soft)]" />
              <input
                type="email"
                placeholder="you@business.com"
                {...register("email")}
                className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
              />
            </div>
            {errors.email && (
              <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.email.message}</p>
            )}

            <div className="flex items-center gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 focus-within:border-[var(--brand)]">
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
                className="text-[var(--soft)] hover:text-[var(--ink)]"
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="pl-1 text-xs font-semibold text-[var(--err)]">{errors.password.message}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="mt-2 w-full rounded-[13px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
