import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Store, CreditCard, BarChart3, Menu, X } from "lucide-react";
import { useCompanyAuth } from "../../context/CompanyAuthContext";
import { PLATFORM_NAME } from "../../lib/platform";
import { StampdLogo } from "../shared/StampdLogo";
import { AccountMenu } from "../shared/AccountMenu";

const NAV = [
  { to: "", end: true, label: "Outlets", Icon: Store },
  { to: "reports", label: "Reports", Icon: BarChart3 },
  { to: "subscription", label: "Subscription", Icon: CreditCard },
];

// Guarded shell for a company owner — the "one login, every outlet" console.
// Uses the shared --brand accent (this is business-side; the platform console
// is the one that uses --plat).
export function CompanyLayout() {
  const { account, company, logout } = useCompanyAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (!account) navigate("/admin-login");
  }, [account, navigate]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  const sidebarContent = (
    <>
      <div className="mb-6 flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <StampdLogo size={36} tile />
          <div className="min-w-0">
            <div className="truncate font-display text-[16px] font-bold leading-none">
              {company?.name || PLATFORM_NAME}
            </div>
            <div className="text-[11px] text-[var(--soft)]">Company console</div>
          </div>
        </div>
        <button
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-2)]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ to, end, label, Icon }) => (
          <NavLink
            key={to || "outlets"}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[14px] font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--primary-soft)] text-[var(--primary-deep)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-[var(--line)] pt-3">
        <AccountMenu
          initial={account.name.charAt(0).toUpperCase()}
          name={account.name}
          email={account.email}
          settingsPath="/company"
          onLogout={logout}
          accent="var(--primary)"
          dropUp
        />
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-[var(--bg)] text-[var(--ink)]">
      {/* Mobile Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 md:hidden">
        <div className="flex items-center gap-2.5">
          <StampdLogo size={28} tile />
          <span className="truncate font-display text-sm font-bold leading-none text-[var(--ink)]">
            {company?.name || PLATFORM_NAME}
          </span>
        </div>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] focus:outline-none"
        >
          <Menu className="h-5.5 w-5.5" />
        </button>
      </header>

      {/* Mobile Drawer (with slide-out transition and backdrop) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-black/40 transition-opacity"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[265px] flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6 shadow-xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[250px] flex-shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6 md:flex">
        {sidebarContent}
      </aside>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 md:px-10 md:py-9 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
export default CompanyLayout;
