import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useTenant } from "../../context/TenantContext";
import { BottomNav } from "./BottomNav";
import { ScannerModal } from "./ScannerModal";

// The authenticated customer app shell: a phone-framed viewport with a shared
// scanner modal and bottom navigation. Wraps the dashboard and wallet routes.
export function CustomerLayout() {
  const { slug, tenant } = useTenant();
  const { user, isLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "customer")) {
      navigate(`/${slug}/login`);
    }
  }, [user, isLoading, navigate, slug]);

  if (isLoading || !user || user.role !== "customer") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
      </div>
    );
  }

  const activeTab = location.pathname.endsWith("/wallet")
    ? "wallet"
    : location.pathname.endsWith("/dashboard")
      ? "dashboard"
      : location.pathname.endsWith("/menu")
        ? "menu"
        : location.pathname.endsWith("/settings")
          ? "settings"
          : "none";

  return (
    <div className="flex min-h-screen w-full items-start justify-center bg-[var(--bg)] px-0 py-0 sm:px-4 sm:py-8">
      <div className="flex min-h-screen w-full max-w-full flex-col overflow-hidden border-[var(--line)] bg-[var(--surface)] sm:min-h-[85vh] sm:max-w-[420px] sm:rounded-[40px] sm:border sm:shadow-xl">
        <ScannerModal
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          slug={slug}
          tenantName={tenant?.name || ""}
          rewardTitle={tenant?.program?.rewardTitle || "reward"}
        />

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>

        <BottomNav slug={slug} activeTab={activeTab} onScanClick={() => setScanOpen(true)} />
      </div>
    </div>
  );
}
export default CustomerLayout;
