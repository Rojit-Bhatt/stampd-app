import { useEffect } from "react";
import { useTenant } from "../../context/TenantContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

// Rendered once per /:slug/* page (landing, login, register, claim,
// dashboard, ...) — this is what makes global-session recognition apply
// everywhere a customer can enter the app, not just the QR-claim flow.
export function TenantSessionSync() {
  const { companySlug, outletSlug, tenant } = useTenant();
  const { ensureTenantSession } = useCustomerAuth();

  useEffect(() => {
    if (tenant) {
      // Keyed on the company/outlet PAIR so this shares an identity with the
      // earlier call TenantProvider makes before this component can even
      // mount — an outlet slug alone is unique only within its company.
      ensureTenantSession(`${companySlug}/${outletSlug}`, tenant.id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companySlug, outletSlug, tenant?.id]);

  return null;
}

export default TenantSessionSync;
