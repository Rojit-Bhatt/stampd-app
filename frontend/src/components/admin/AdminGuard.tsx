import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAdminAuth();
  const navigate = useNavigate();
  const { slug } = useParams();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "business_admin")) {
      navigate(slug ? `/${slug}/admin/login` : "/");
    }
  }, [user, isLoading, navigate, slug]);

  if (isLoading) {
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

  return <>{children}</>;
}
