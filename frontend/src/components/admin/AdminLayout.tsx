import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  QrCode,
  TicketCheck,
  Users,
  Coins,
  Receipt,
  Gift,
  Zap,
  Palette,
  UtensilsCrossed,
  FileSpreadsheet,
  Phone,
  Calendar,
  ChevronDown,
  CreditCard,
  Menu as MenuIcon,
} from "lucide-react";

import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { useAccount } from "../../hooks/useAccount";
import { AccountMenu } from "../shared/AccountMenu";
import { tenantPath } from "../../lib/tenantPath";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";

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

// Earn and Redeem are deliberately NOT in this list — they're the two things
// staff do all day, so they're pinned as actions at the foot of the rail and
// again as the hero of the overview, rather than being two rows among
// fifteen. Nothing is removed; the counter actions just stop competing with
// settings for the same visual weight.
const NAV: (NavLeaf | NavGroup)[] = [
  { to: "", end: true, label: "Overview", Icon: LayoutDashboard },
  { to: "transactions", label: "Transactions", Icon: Receipt },
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

const BASE_MANAGEMENT_NAV: NavLeaf[] = [
  { to: "program", label: "Points program", Icon: Coins },
  { to: "rewards", label: "Rewards", Icon: Gift },
  { to: "campaigns", label: "Campaigns", Icon: Zap },
  { to: "branding", label: "Branding", Icon: Palette },
  { to: "contact", label: "Contact", Icon: Phone },
  { to: "menu", label: "Menu", Icon: UtensilsCrossed },
  { to: "events", label: "Events", Icon: Calendar },
];

// Only shown for a business with an attached owner account — a
// platform-onboarded business with none has no subscription to manage at
// all (GET /api/admin/subscription 404s for it), so this must not appear
// as a dead end.
const SUBSCRIPTION_NAV: NavLeaf = { to: "subscription", label: "Subscription", Icon: CreditCard };

// A group is open if the admin toggled it open, or if one of its children is
// the currently active route (so deep-linking to a sub-report doesn't hide the
// nav item that reveals it).
function groupsWithActiveChild(pathname: string): Set<string> {
  const open = new Set<string>();
  for (const item of NAV) {
    if (isGroup(item) && item.children.some((c) => pathname.includes(c.to))) {
      open.add(item.label);
    }
  }
  return open;
}

// Nav is navigation, so the active state is green (the system's action
// colour), not the tenant hue. The outlet's own colour appears once, on the
// logo tile — staff switching between two outlets should see the same console
// wearing a different badge, not a differently-coloured app.
function navLinkClass({ isActive }: { isActive: boolean }) {
  return `relative flex items-center gap-3 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors ${
    isActive
      ? "bg-[var(--primary-soft)] text-[var(--primary-deep)]"
      : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
  }`;
}

export function AdminLayout() {
  const { companySlug = "", outletSlug = "" } = useParams();
  const slug = outletSlug;
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAdminAuth();
  const { data: settings } = useAdminSettings();
  const managementNav = settings?.hasOwnerAccount
    ? [...BASE_MANAGEMENT_NAV, SUBSCRIPTION_NAV]
    : BASE_MANAGEMENT_NAV;
  const { data: account } = useAccount("admin");

  const name = settings?.name || "Business";
  const initial = name.charAt(0).toUpperCase();
  const brand = settings?.branding?.primaryColor || "#0FA968";

  const [openGroups, setOpenGroups] = useState<Set<string>>(() =>
    groupsWithActiveChild(location.pathname),
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const active = groupsWithActiveChild(location.pathname);
    if (active.size === 0) return;
    setOpenGroups((prev) => new Set([...prev, ...active]));
  }, [location.pathname]);

  // The rail is a drawer on a tablet or phone, so navigating has to close it.
  useEffect(() => {
    setMobileNavOpen(false);
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
    navigate(tenantPath(companySlug, slug, "admin/login"));
  };

  const railBody = (
    <>
      <div className="mb-6 flex items-center gap-2.5 px-2">
        {/* The one place the outlet's own colour appears in this console. */}
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-field)] font-display text-sm font-bold"
          style={{ background: brand, color: "#fff" }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-bold leading-tight">{name}</div>
          <div className="text-[11px] text-[var(--soft)]">Outlet console</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) =>
          isGroup(item) ? (
            <div key={item.label}>
              <button
                onClick={() => toggleGroup(item.label)}
                className="flex w-full items-center gap-3 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[13.5px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
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
          ),
        )}

        <div className="mb-1 mt-5 px-3.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          Manage
        </div>
        {managementNav.map((item) => (
          <NavLink key={item.to} to={item.to} className={navLinkClass}>
            <item.Icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* The two counter actions, pinned. Everything above is something staff
          look at; these are the things they DO, dozens of times a shift. */}
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <NavLink
          to="generate"
          className="flex items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-[var(--primary)] py-3 text-[13.5px] font-bold text-white transition-colors hover:bg-[var(--primary-deep)]"
        >
          <QrCode className="h-4 w-4" />
          Earn code
        </NavLink>
        <NavLink
          to="redeem"
          className="flex items-center justify-center gap-2 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 text-[13.5px] font-bold text-[var(--ink)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary-deep)]"
        >
          <TicketCheck className="h-4 w-4" />
          Redeem
        </NavLink>

        <div className="mt-2 border-t border-[var(--line)] pt-3">
          <AccountMenu
            initial={(account?.name || user?.name || "?").charAt(0).toUpperCase()}
            name={account?.name || user?.name || ""}
            settingsPath="settings"
            onLogout={handleLogout}
            dropUp
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--ink)]" style={{ ["--brand" as any]: brand }}>
      {/* Desktop rail. */}
      <aside className="sticky top-0 hidden h-screen w-[248px] flex-shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6 lg:flex">
        {railBody}
      </aside>

      {/* Tablet / phone: the same rail in a drawer. This console is used at a
          counter on whatever device is to hand, so it can't be desktop-only. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-[280px] flex-col overflow-y-auto px-4 py-6">
          <SheetTitle className="sr-only">Console navigation</SheetTitle>
          {railBody}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-btn)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="truncate font-display text-base font-bold">{name}</span>
          <NavLink
            to="generate"
            className="ml-auto flex items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--primary)] px-3.5 py-2.5 text-sm font-bold text-white"
          >
            <QrCode className="h-4 w-4" />
            Earn
          </NavLink>
        </header>

        <main className="mx-auto w-full max-w-[1100px] flex-1 px-5 py-6 lg:px-10 lg:py-9">
          {settings?.subscriptionReminder?.show && (
            <Link
              to="subscription"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-btn)] bg-[var(--warn-soft)] px-5 py-3.5 text-sm"
              style={{ color: "var(--warn)" }}
            >
              <span>
                {settings.subscriptionReminder.daysLeft >= 0
                  ? `Your subscription renews in ${settings.subscriptionReminder.daysLeft} day${settings.subscriptionReminder.daysLeft === 1 ? "" : "s"}.`
                  : `Your subscription is ${Math.abs(settings.subscriptionReminder.daysLeft)} day${Math.abs(settings.subscriptionReminder.daysLeft) === 1 ? "" : "s"} overdue.`}
              </span>
              <span className="font-bold underline">Manage subscription →</span>
            </Link>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
