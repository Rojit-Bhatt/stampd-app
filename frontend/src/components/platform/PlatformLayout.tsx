import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Building2, PlusCircle, Phone } from "lucide-react";
import { usePlatformAuth } from "../../context/PlatformAuthContext";
import { PLATFORM_NAME } from "../../lib/platform";
import { useAccount } from "../../hooks/useAccount";
import { AccountMenu } from "../shared/AccountMenu";

const NAV = [
  { to: "", end: true, label: "Businesses", Icon: Building2 },
  { to: "onboard", label: "Onboard new", Icon: PlusCircle },
  { to: "contact", label: "Contact", Icon: Phone },
];

// Guarded desktop shell for the platform super-admin. Accent (--plat)
// aliases the single shared --brand token — the platform console is not
// tenant-facing but still uses the one Stampd identity, not a separate one.
export function PlatformLayout() {
  const { user, isLoading, logout } = usePlatformAuth();
  const navigate = useNavigate();
  const { data: account } = useAccount("platform");

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "platform")) {
      navigate("/platform/login");
    }
  }, [user, isLoading, navigate]);

  if (isLoading || !user || user.role !== "platform") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--plat)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <aside className="sticky top-0 flex h-screen w-[250px] flex-shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl font-display text-sm font-bold text-white"
            style={{ background: "var(--plat)" }}
          >
            {PLATFORM_NAME.charAt(0)}
          </div>
          <div>
            <div className="font-display text-[16px] font-bold leading-none">{PLATFORM_NAME}</div>
            <div className="text-[11px] text-[var(--soft)]">Platform console</div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to || "businesses"}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold transition-colors ${
                  isActive
                    ? "bg-[var(--surface-container)] text-[var(--plat)] after:absolute after:right-0 after:top-1/2 after:h-4 after:w-[3px] after:-translate-y-1/2 after:rounded-full after:bg-[var(--plat)]"
                    : "text-[var(--ink)] hover:bg-[var(--surface-container)]"
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
            initial={(account?.name || user.name).charAt(0).toUpperCase()}
            name={account?.name || user.name}
            settingsPath="/platform/settings"
            onLogout={() => {
              logout();
              navigate("/platform/login");
            }}
            accent="var(--plat)"
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
export default PlatformLayout;
