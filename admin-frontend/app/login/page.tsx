'use client';

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Coffee, Mail, Lock, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { user, login, isLoading } = useAuth();
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && user.role === "admin") {
      router.push("/console");
    }
  }, [user, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Logging in as staff...");
    try {
      await login(data.email, data.password);
      toast.success("Welcome to the Barista Console!", { id: toastId });
      router.push("/console");
    } catch (err: any) {
      toast.error(err.message || "Failed to log in. Please try again.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-[#121212] font-sans text-[#EBE6DF] px-4">
      <div className="relative w-full max-w-md">
        {/* Logo Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center border border-[#2D2D2D] bg-[#1A1A1A] rounded-[20px]">
            <Coffee className="h-6 w-6 text-[#EBE6DF]" strokeWidth={1.6} />
          </div>
          <h1 className="mt-4 text-3xl font-serif font-normal text-[#EBE6DF] tracking-tight">
            Mansarowar<span className="italic"> Staff</span>
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.24em] text-[#A3A3A3] font-bold">
            Barista Console Access
          </p>
        </div>

        {/* Card Frame */}
        <div className="border border-[#2D2D2D] bg-[#1A1A1A] p-8 rounded-[48px] overflow-hidden shadow-none">
          <div className="mb-6">
            <h2 className="text-xl font-serif font-normal text-[#EBE6DF]">
              Authorized Login Only
            </h2>
            <p className="text-sm text-[#A3A3A3] mt-1">
              Please sign in with your staff credentials.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A3A3A3]">
                Staff Email
              </label>
              <div className="flex items-center gap-3 border border-[#2D2D2D] bg-[#121212] px-4 py-3.5 transition-colors focus-within:border-[#EBE6DF] rounded-[32px] overflow-hidden">
                <Mail className="h-4 w-4 text-[#A3A3A3]/50" />
                <input
                  type="email"
                  placeholder="barista@mansarowar.cafe"
                  {...register("email")}
                  className="w-full bg-transparent text-sm text-[#EBE6DF] placeholder:text-[#A3A3A3]/30 focus:outline-none"
                />
              </div>
              {errors.email && (
                <p className="text-xs font-semibold text-red-500 pl-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A3A3A3]">
                Security Password
              </label>
              <div className="flex items-center gap-3 border border-[#2D2D2D] bg-[#121212] px-4 py-3.5 transition-colors focus-within:border-[#EBE6DF] rounded-[32px] overflow-hidden">
                <Lock className="h-4 w-4 text-[#A3A3A3]/50" />
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  {...register("password")}
                  className="w-full bg-transparent text-sm text-[#EBE6DF] placeholder:text-[#A3A3A3]/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="text-[#A3A3A3] hover:text-[#EBE6DF] focus:outline-none"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs font-semibold text-red-500 pl-1">{errors.password.message}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full bg-[#EBE6DF] py-4 text-sm font-semibold tracking-wider text-black border border-[#EBE6DF] hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 uppercase tracking-widest rounded-full transition-transform duration-200 hover:scale-[1.02]"
            >
              {isSubmitting ? "Authenticating..." : "Access Console"}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-[#A3A3A3]">
          Mansarowar Cafe Staff Directory. Unauthorized entry attempts are logged.
        </p>
      </div>
    </div>
  );
}
