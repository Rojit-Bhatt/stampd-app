import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { QrCode, Bell } from "lucide-react";
import toast from "react-hot-toast";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useTenant } from "../../context/TenantContext";
import { useAccount } from "../../hooks/useAccount";
import { PLATFORM_NAME } from "../../lib/platform";
import { BottomNav } from "./BottomNav";
import { ScannerModal } from "./ScannerModal";
import { StampdLogo } from "../shared/StampdLogo";
import { tenantPath } from "../../lib/tenantPath";

// The authenticated customer app shell: a phone-framed viewport with a shared
// scanner modal and bottom navigation. Wraps the dashboard and history routes.
export function CustomerLayout() {
  const { companySlug, slug, tenant } = useTenant();
  const { user, isLoading } = useCustomerAuth();
  const { data: account } = useAccount("customer");
  const navigate = useNavigate();
  const location = useLocation();
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "customer")) {
      navigate(tenantPath(companySlug, slug, "login"));
    }
  }, [user, isLoading, navigate, slug]);

  if (isLoading || !user || user.role !== "customer") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
      </div>
    );
  }

  const activeTab = location.pathname.endsWith("/history")
    ? "history"
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
        />

        <header className="flex flex-shrink-0 items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <StampdLogo size={22} />
            <span className="font-display text-xl font-bold" style={{ color: "var(--brand)" }}>
              {PLATFORM_NAME}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScanOpen(true)}
              aria-label="Scan to earn points"
              className="stamp-interactive flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-container)] text-[var(--ink)]"
            >
              <QrCode className="h-4 w-4" />
            </button>
            <button
              onClick={() => toast("No notifications yet.")}
              aria-label="Notifications"
              className="stamp-interactive flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-container)] text-[var(--ink)]"
            >
              <Bell className="h-4 w-4" />
            </button>
            <Link
              to={tenantPath(companySlug, slug, "settings")}
              aria-label="Account settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: "var(--brand)" }}
            >
              {(account?.name || "?").charAt(0).toUpperCase()}
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>

        <BottomNav slug={slug} activeTab={activeTab} onScanClick={() => setScanOpen(true)} />
      </div>
    </div>
  );
}
export default CustomerLayout;
