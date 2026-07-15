import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  QrCode,
  TicketCheck,
  Users,
  Stamp,
  Palette,
  UtensilsCrossed,
  FileSpreadsheet,
  Phone,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { useAccount } from "../../hooks/useAccount";
import { AccountMenu } from "../shared/AccountMenu";

interface NavLeaf {
  to: string;
  end?: boolean;
  label: string;
  Icon: typeof LayoutDashboard;
}

interface NavGroup {
  label: string;
  Icon: typeof LayoutDashboard;
  children: { to: string; label: string }[];
}

const isGroup = (item: NavLeaf | NavGroup): item is NavGroup => "children" in item;

const NAV: (NavLeaf | NavGroup)[] = [
  { to: "", end: true, label: "Overview", Icon: LayoutDashboard },
  { to: "redeem", label: "Redeem voucher", Icon: TicketCheck },
  { to: "customers", label: "Customers", Icon: Users },
  {
    label: "Reports",
    Icon: FileSpreadsheet,
    children: [
      { to: "reports/summary", label: "Summary report" },
      { to: "reports/customers", label: "Customer report" },
    ],
  },
];

const MANAGEMENT_NAV: NavLeaf[] = [
  { to: "program", label: "Stamp program", Icon: Stamp },
  { to: "branding", label: "Branding", Icon: Palette },
  { to: "contact", label: "Contact", Icon: Phone },
  { to: "menu", label: "Menu", Icon: UtensilsCrossed },
  { to: "events", label: "Events", Icon: Calendar },
];

// Desktop business-admin console shell. Sidebar recolors from the tenant's
// brand; content routes render in <Outlet/>.
// A group is open if the admin toggled it open, or if one of its children
// is the currently active route (so deep-linking to a sub-report doesn't
// hide the nav item that reveals it).
function groupsWithActiveChild(pathname: string): Set<string> {
  const open = new Set<string>();
  for (const item of NAV) {
    if (isGroup(item) && item.children.some((c) => pathname.includes(c.to))) {
      open.add(item.label);
    }
  }
  return open;
}

export function AdminLayout() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAdminAuth();
  const { data: settings } = useAdminSettings();
  const { data: account } = useAccount("admin");

  const name = settings?.name || "Business";
  const initial = name.charAt(0).toUpperCase();
  const brand = settings?.branding?.primaryColor || "#B5533C";

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => groupsWithActiveChild(location.pathname));

  useEffect(() => {
    const active = groupsWithActiveChild(location.pathname);
    if (active.size === 0) return;
    setOpenGroups((prev) => new Set([...prev, ...active]));
  }, [location.pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate(`/${slug}/admin/login`);
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--ink)]" style={{ ["--brand" as any]: brand }}>
      <aside className="sticky top-0 flex h-screen w-[250px] flex-shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl font-display text-sm font-bold text-white"
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
          {NAV.map((item) =>
            isGroup(item) ? (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13.5px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-container)]"
                  aria-expanded={openGroups.has(item.label)}
                >
                  <item.Icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    className="h-3.5 w-3.5 flex-shrink-0 transition-transform"
                    style={{ transform: openGroups.has(item.label) ? "rotate(180deg)" : undefined }}
                  />
                </button>
                {openGroups.has(item.label) && (
                  <div className="ml-4 flex flex-col gap-0.5 border-l border-[var(--line)] pl-3">
                    {item.children.map((child) => (
                      <NavLink key={child.to} to={child.to} className={navLinkClass}>
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={item.to || "overview"} to={item.to} end={item.end} className={navLinkClass}>
                <item.Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          )}

          <div className="mb-1 mt-4 px-3.5 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
            Management
          </div>
          {MANAGEMENT_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              <item.Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 pt-3">
          <NavLink
            to="generate"
            className="stamp-interactive flex items-center justify-center gap-2 rounded-full py-3 text-[13.5px] font-bold text-white"
            style={{ background: "var(--brand)" }}
          >
            <QrCode className="h-4 w-4" />
            Generate stamp
          </NavLink>
          <div className="border-t border-[var(--line)] pt-3">
            <AccountMenu
              initial={(account?.name || user?.name || "?").charAt(0).toUpperCase()}
              name={account?.name || user?.name || ""}
              settingsPath="settings"
              onLogout={handleLogout}
              dropUp
            />
          </div>
        </div>
      </aside>

      <main className="max-w-[1100px] flex-1 px-10 py-9">
        <Outlet />
      </main>
    </div>
  );
}

// Pale-tint active state with a trailing accent bar, matching the reference
// design's sidebar treatment — a rounded row, not a solid brand-fill block.
function navLinkClass({ isActive }: { isActive: boolean }) {
  return `relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors ${
    isActive
      ? "bg-[var(--surface-container)] text-[var(--brand)] after:absolute after:right-0 after:top-1/2 after:h-4 after:w-[3px] after:-translate-y-1/2 after:rounded-full after:bg-[var(--brand)]"
      : "text-[var(--ink)] hover:bg-[var(--surface-container)]"
  }`;
}
export default AdminLayout;
