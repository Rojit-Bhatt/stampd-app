import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Store, CreditCard, BarChart3 } from "lucide-react";
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

  useEffect(() => {
    if (!account) navigate("/admin-login");
  }, [account, navigate]);

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <aside className="sticky top-0 flex h-screen w-[250px] flex-shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <StampdLogo size={36} tile />
          <div className="min-w-0">
            <div className="truncate font-display text-[16px] font-bold leading-none">
              {company?.name || PLATFORM_NAME}
            </div>
            <div className="text-[11px] text-[var(--soft)]">Company console</div>
          </div>
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
      </aside>

      <main className="max-w-[1180px] flex-1 px-10 py-9">
        <Outlet />
      </main>
    </div>
  );
}
export default CompanyLayout;
