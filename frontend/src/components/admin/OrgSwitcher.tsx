import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Building2, ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { tenantPath } from "../../lib/tenantPath";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";

interface Outlet {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
}

interface CompanyInfo {
  slug: string;
  name: string;
}

const readCompanyInfo = (): CompanyInfo | null => {
  try {
    const raw = localStorage.getItem("company_info");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Renders only when the signed-in admin is a company owner who used
 * enter-outlet to drop into this console — enter-outlet never clears
 * company_session, it only adds a tenant token alongside it, so that key's
 * presence is exactly the "this is an owner passing through" signal. A
 * genuine outlet_admin has no company relationship and never has this key.
 */
export function OrgSwitcher() {
  const navigate = useNavigate();
  const { outletSlug } = useParams();
  const companyInfo = readCompanyInfo();
  const hasCompanySession = Boolean(localStorage.getItem("company_session"));

  const { data: outlets = [] } = useQuery<Outlet[]>({
    queryKey: ["companyOutlets"],
    enabled: hasCompanySession,
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; outlets: Outlet[] }>(
        "/api/company/outlets",
        { role: "company" },
      );
      return res.outlets;
    },
  });

  if (!hasCompanySession || !companyInfo) return null;

  const active = outlets.filter((o) => o.status !== "archived");

  const enterOutlet = async (outlet: Outlet) => {
    try {
      const res = await apiRequest<{ token: string; user: any; companySlug: string; outletSlug: string }>(
        "/api/company/enter-outlet",
        { method: "POST", role: "company", body: { organizationId: outlet.id } },
      );
      localStorage.setItem("admin_auth_token", res.token);
      localStorage.setItem("admin_auth_user", JSON.stringify(res.user));
      window.location.href = tenantPath(res.companySlug, res.outletSlug, "admin");
    } catch {
      // enter-outlet failing here is rare (the outlet existed a moment ago,
      // per the list this menu is built from) — a full reload retry is
      // simpler than a bespoke error path for a case this narrow.
    }
  };

  const backToCompany = () => {
    localStorage.removeItem("admin_auth_token");
    localStorage.removeItem("admin_auth_user");
    navigate("/company");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-[var(--radius-btn)] px-2 py-2 text-left text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--ink)]">
          <Building2 className="h-4 w-4 flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate">{companyInfo.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[220px]">
        <DropdownMenuItem onClick={backToCompany} className="cursor-pointer">
          <ArrowLeft />
          Back to company dashboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Outlets</DropdownMenuLabel>
        {active.map((outlet) => (
          <DropdownMenuItem
            key={outlet.id}
            disabled={outlet.slug === outletSlug}
            onClick={() => enterOutlet(outlet)}
            className="cursor-pointer"
          >
            {outlet.name}
            {outlet.slug === outletSlug ? " (current)" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
