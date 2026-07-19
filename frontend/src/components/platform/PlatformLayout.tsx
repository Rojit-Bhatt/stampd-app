import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, LayoutGrid, Settings2 } from "lucide-react";

import { usePlatformAuth } from "../../context/PlatformAuthContext";
import { PLATFORM_NAME } from "../../lib/platform";
import { useAccount } from "../../hooks/useAccount";
import { AccountMenu } from "../shared/AccountMenu";
import { StampdLogo } from "../shared/StampdLogo";
import { apiRequest } from "../../lib/api";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "../ui/command";

interface SubTab {
  to: string;
  end?: boolean;
  label: string;
  ownerOnly?: boolean;
}

interface Section {
  id: string;
  label: string;
  /** Any path starting with one of these belongs to this section. */
  match: string[];
  tabs: SubTab[];
  ownerOnly?: boolean;
}

// Two tiers instead of one flat rail of nine. The top row is what you're
// working ON; the row under it is what you can do there, so nav depth reads
// as a breadcrumb and tables get the full width of the window.
//
// Registering a company, the team, plans and keys are all owner-only on the
// backend (isPlatformOwner) — hidden from a support admin rather than left
// visible only to fail on submit.
const SECTIONS: Section[] = [
  {
    id: "companies",
    label: "Companies",
    match: ["/platform", "/platform/register", "/platform/company"],
    tabs: [
      { to: "/platform", end: true, label: "All companies" },
      { to: "/platform/register", label: "Register", ownerOnly: true },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    match: ["/platform/analytics"],
    tabs: [{ to: "/platform/analytics", end: true, label: "Overview" }],
  },
  {
    id: "billing",
    label: "Billing",
    match: ["/platform/plans", "/platform/subscription-keys"],
    ownerOnly: true,
    tabs: [
      { to: "/platform/plans", label: "Plans", ownerOnly: true },
      { to: "/platform/subscription-keys", label: "Subscription keys", ownerOnly: true },
    ],
  },
  {
    id: "config",
    label: "Config",
    match: ["/platform/team", "/platform/contact", "/platform/audit-log", "/platform/settings"],
    tabs: [
      { to: "/platform/team", label: "Team", ownerOnly: true },
      { to: "/platform/contact", label: "Contact" },
      { to: "/platform/audit-log", label: "Activity log" },
    ],
  },
];

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
}

export function PlatformLayout() {
  const { user, isLoading, logout } = usePlatformAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: account } = useAccount("platform");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const isOwner = user?.platformRole === "owner";

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "platform")) {
      navigate("/platform/login");
    }
  }, [user, isLoading, navigate]);

  // Cmd/Ctrl-K from anywhere in the console. This is a tool someone lives in
  // all day across dozens of companies, so jumping beats clicking.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { data: companies = [] } = useQuery<CompanyRow[]>({
    queryKey: ["platformCompanies"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; companies: CompanyRow[] }>(
        "/api/platform/companies",
        { role: "platform" },
      );
      return res.companies || [];
    },
    enabled: Boolean(user),
  });

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !s.ownerOnly || isOwner),
    [isOwner],
  );

  // Longest match wins, so /platform/register picks Companies rather than
  // falling back to the bare /platform prefix.
  const activeSection = useMemo(() => {
    let best: Section | null = null;
    let bestLen = -1;
    for (const s of visibleSections) {
      for (const m of s.match) {
        if ((location.pathname === m || location.pathname.startsWith(m + "/")) && m.length > bestLen) {
          best = s;
          bestLen = m.length;
        }
      }
    }
    return best ?? visibleSections[0];
  }, [location.pathname, visibleSections]);

  if (isLoading || !user || user.role !== "platform") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  const subTabs = (activeSection?.tabs ?? []).filter((t) => !t.ownerOnly || isOwner);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--ink)]">
      {/* Dark chrome, on purpose: this console is not a tenant's and should
          never be mistaken for one. The outlet console is light and warm;
          this one is a data desk. */}
      <header className="sticky top-0 z-30 bg-[var(--ink)] text-[#E9F0EC]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 px-6 py-3">
          <NavLink to="/platform" className="flex flex-shrink-0 items-center gap-2.5">
            <StampdLogo size={26} />
            <span className="hidden font-display text-base font-bold lg:inline">{PLATFORM_NAME}</span>
            <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8DA79A] xl:inline">
              Platform
            </span>
          </NavLink>

          <nav className="hide-scrollbar ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {visibleSections.map((s) => {
              const active = s.id === activeSection?.id;
              return (
                <NavLink
                  key={s.id}
                  to={s.tabs[0].to}
                  end={s.tabs[0].end}
                  className={`whitespace-nowrap rounded-[var(--radius-btn)] px-3 py-2 text-sm font-semibold transition-colors ${
                    active ? "bg-white/12 text-white" : "text-[#8DA79A] hover:text-white"
                  }`}
                >
                  {s.label}
                </NavLink>
              );
            })}
          </nav>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex flex-shrink-0 items-center gap-2 rounded-[var(--radius-btn)] bg-white/10 px-3 py-2 text-sm text-[#8DA79A] transition-colors hover:text-white"
          >
            <Search className="h-4 w-4" />
            <span className="hidden lg:inline">Search</span>
            <CommandShortcut className="hidden text-[#6E8578] lg:inline">⌘K</CommandShortcut>
          </button>

          <div className="flex-shrink-0">
            <AccountMenu
              initial={(account?.name || user.name).charAt(0).toUpperCase()}
              name={account?.name || user.name}
              settingsPath="/platform/settings"
              onLogout={() => {
                logout();
                navigate("/platform/login");
              }}
              accent="var(--primary)"
              compact
            />
          </div>
        </div>

        {/* Contextual sub-nav. Hidden when a section has only one place to
            be — a single tab is decoration, not navigation. */}
        {subTabs.length > 1 && (
          <div className="border-t border-white/10">
            <div className="hide-scrollbar mx-auto flex w-full max-w-[1400px] items-center gap-5 overflow-x-auto px-6">
              {subTabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    `whitespace-nowrap border-b-2 py-2.5 text-[13px] font-semibold transition-colors ${
                      isActive
                        ? "border-[var(--primary)] text-white"
                        : "border-transparent text-[#8DA79A] hover:text-white"
                    }`
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">
        <Outlet />
      </main>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Jump to a company or screen…" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>
          {companies.length > 0 && (
            <CommandGroup heading="Companies">
              {companies.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.slug}`}
                  onSelect={() => {
                    setPaletteOpen(false);
                    navigate(`/platform/company/${c.id}`);
                  }}
                >
                  <Building2 />
                  {c.name}
                  <CommandShortcut className="font-mono">{c.slug}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Screens">
            {visibleSections.flatMap((s) =>
              s.tabs
                .filter((t) => !t.ownerOnly || isOwner)
                .map((t) => (
                  <CommandItem
                    key={t.to}
                    value={`${s.label} ${t.label}`}
                    onSelect={() => {
                      setPaletteOpen(false);
                      navigate(t.to);
                    }}
                  >
                    {s.id === "config" ? <Settings2 /> : <LayoutGrid />}
                    {s.label} · {t.label}
                  </CommandItem>
                )),
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

export default PlatformLayout;
