import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  QrCode,
  TicketCheck,
  Users,
  Stamp,
  Palette,
  UtensilsCrossed,
  LogOut,
} from "lucide-react";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAdminSettings } from "../../hooks/useAdminSettings";

const NAV = [
  { to: "", end: true, label: "Overview", Icon: LayoutDashboard },
  { to: "generate", label: "Generate stamp", Icon: QrCode },
  { to: "redeem", label: "Redeem voucher", Icon: TicketCheck },
  { to: "customers", label: "Customers", Icon: Users },
  { to: "program", label: "Stamp program", Icon: Stamp },
  { to: "branding", label: "Branding", Icon: Palette },
  { to: "menu", label: "Menu", Icon: UtensilsCrossed },
];

// Desktop business-admin console shell. Sidebar recolors from the tenant's
// brand; content routes render in <Outlet/>.
export function AdminLayout() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAdminAuth();
  const { data: settings } = useAdminSettings();

  const name = settings?.name || "Business";
  const initial = name.charAt(0).toUpperCase();
  const brand = settings?.branding?.primaryColor || "#B5533C";

  const handleLogout = () => {
    logout();
    navigate(`/${slug}/admin/login`);
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--ink)]" style={{ ["--brand" as any]: brand }}>
      <aside className="sticky top-0 flex h-screen w-[250px] flex-shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px] font-display text-sm font-extrabold text-white"
            style={{ background: "var(--brand)" }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-bold leading-none">{name}</div>
            <div className="text-[11px] text-[var(--soft)]">Business console</div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to || "overview"}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[11px] px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  isActive
                    ? "text-white"
                    : "text-[var(--ink)] hover:bg-[var(--bg)]"
                }`
              }
              style={({ isActive }) => (isActive ? { background: "var(--brand)" } : undefined)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-[var(--line)] pt-3">
          <div className="mb-2 px-2 text-[13px]">
            <div className="font-bold">{user?.name}</div>
            <div className="text-[11px] text-[var(--soft)]">Business admin</div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-[11px] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--bg)]"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <main className="max-w-[1100px] flex-1 px-10 py-9">
        <Outlet />
      </main>
    </div>
  );
}
export default AdminLayout;
