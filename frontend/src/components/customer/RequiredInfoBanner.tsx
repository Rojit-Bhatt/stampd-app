import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { useTenant } from "../../context/TenantContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiRequest } from "../../lib/api";
import { tenantPath } from "../../lib/tenantPath";

/**
 * Covers the two paths that create a membership with no form moment to
 * block on: a brand-new global signup (no tenant in scope at registration)
 * and an existing account auto-provisioned into a new outlet via
 * enter-tenant. Both land here instead — a request, not a gate, since
 * neither path has anywhere to have blocked in the first place.
 */
export function RequiredInfoBanner() {
  const { tenant, companySlug, slug } = useTenant();
  const { globalAccount, token } = useCustomerAuth();
  const qc = useQueryClient();
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["accountMe", "customer", token],
    queryFn: () => apiRequest<{ success: boolean; infoPromptDismissed?: boolean }>("/api/account/me", { role: "customer" }),
    enabled: Boolean(token),
  });

  const dismiss = useMutation({
    mutationFn: () => apiRequest("/api/account/dismiss-info-prompt", { method: "PATCH", role: "customer" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accountMe", "customer", token] }),
  });

  if (!tenant || !globalAccount || !me) return null;
  if (locallyDismissed || me.infoPromptDismissed) return null;

  const missingDOB = tenant.customerInfo.requireDateOfBirth &&
    (globalAccount.birthdayMonth == null || globalAccount.birthdayDay == null);
  const missingGender = tenant.customerInfo.requireGender && globalAccount.gender == null;

  if (!missingDOB && !missingGender) return null;

  const what = missingDOB && missingGender ? "your birthday and gender" : missingDOB ? "your birthday" : "your gender";

  const onDismiss = () => {
    // Optimistic: hides immediately, doesn't wait on the network. A failed
    // dismiss just means it can reappear once — not worth blocking a
    // low-stakes action on.
    setLocallyDismissed(true);
    dismiss.mutate();
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-btn)] bg-[var(--surface-2)] px-4 py-3 text-sm">
      <span className="text-[var(--ink)]">
        Mind sharing {what}? We'll send something nice when it matters.{" "}
        <Link to={tenantPath(companySlug, slug, "settings")} className="font-bold underline">
          Add it
        </Link>
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--bg)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
