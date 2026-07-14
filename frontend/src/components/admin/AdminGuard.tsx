import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { VerifyEmailGate } from "./VerifyEmailGate";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAdminAuth();
  const navigate = useNavigate();
  const { slug } = useParams();
  const { data: settings, isLoading: settingsLoading } = useAdminSettings();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "business_admin")) {
      navigate(slug ? `/${slug}/admin/login` : "/");
    }
  }, [user, isLoading, navigate, slug]);

  if (isLoading || (user && user.role === "business_admin" && settingsLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212]">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#EBE6DF] animate-pulse">
          Verifying credentials...
        </div>
      </div>
    );
  }

  if (!user || user.role !== "business_admin") {
    return null;
  }

  if (settings && !settings.adminEmailVerified) {
    return <VerifyEmailGate />;
  }

  return <>{children}</>;
}
