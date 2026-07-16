import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../ui/skeleton";

interface SubscriptionSummary {
  planSlug: string;
  status: string;
  effectiveStatus: "trialing" | "active" | "grace" | "expired" | "canceled" | "none";
  businessLimitAtPurchase: number;
  businessCount: number;
  currentPeriodEnd: string;
  daysUntilExpiry: number;
  isComped: boolean;
}

interface SubscriptionResponse {
  success: boolean;
  subscription: SubscriptionSummary | null;
  reminder: { show: boolean; daysLeft?: number };
  platformContact: { phone: string; email: string };
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  grace: "Renewal due",
  expired: "Expired",
  canceled: "Canceled",
  none: "No subscription",
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  trialing: { bg: "var(--info-soft)", fg: "var(--info)" },
  active: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  grace: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  expired: { bg: "var(--err)", fg: "white" },
  canceled: { bg: "var(--surface-container-high)", fg: "var(--soft)" },
  none: { bg: "var(--surface-container-high)", fg: "var(--soft)" },
};

const humanizePlanSlug = (slug: string) => {
  if (slug === "trial") return "Free trial";
  if (slug === "grandfathered") return "Grandfathered";
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "—";
};

interface SubscriptionPanelProps {
  queryKey: string;
  fetchPath: string;
  redeemPath: string;
  role: "owner-global" | "admin";
  // Extra query-key prefixes to invalidate on a successful redemption — e.g.
  // "adminSettings" so AdminLayout's reminder banner (which reads settings,
  // not this panel's own query) refreshes too. Matched by predicate since
  // that key also carries a dynamic orgId segment.
  extraInvalidateKeyPrefixes?: string[];
}

// Shared between the owner's global dashboard (/owner/subscription) and the
// tenant-scoped business console (/:slug/admin/subscription) — same data
// shape either way (both funnel through subscriptionService.getSubscriptionSummary
// server-side), just a different auth role/path.
export function SubscriptionPanel({ queryKey, fetchPath, redeemPath, role, extraInvalidateKeyPrefixes }: SubscriptionPanelProps) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");

  const { data, isLoading } = useQuery<SubscriptionResponse>({
    queryKey: [queryKey],
    queryFn: () => apiRequest<SubscriptionResponse>(fetchPath, { role }),
  });

  const redeem = useMutation({
    mutationFn: (keyCode: string) => apiRequest(redeemPath, { method: "POST", role, body: { code: keyCode } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      for (const prefix of extraInvalidateKeyPrefixes || []) {
        qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === prefix });
      }
      toast.success("Subscription activated!");
      setCode("");
    },
    onError: (e: any) => toast.error(e.message || "That key didn't work — check it and try again."),
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    );
  }

  const sub = data?.subscription;
  const effectiveStatus = sub?.effectiveStatus || "none";
  const statusColor = STATUS_COLOR[effectiveStatus] || STATUS_COLOR.none;
  const daysLeft = sub?.daysUntilExpiry ?? null;
  const showContact = data?.reminder?.show;
  const contact = data?.platformContact;

  return (
    <div>
      <h1 className="font-display text-[30px] font-extrabold text-[var(--ink)]">Subscription</h1>
      <p className="mb-6 text-[var(--muted)]">
        Renewals are confirmed manually — we'll reach out, and you'll enter an activation key here.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-[var(--ink)]">{humanizePlanSlug(sub?.planSlug || "")}</h3>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: statusColor.bg, color: statusColor.fg }}>
              {STATUS_LABEL[effectiveStatus] || effectiveStatus}
            </span>
          </div>

          {sub ? (
            <>
              <div className="mb-1 font-display text-[40px] font-extrabold leading-none text-[var(--ink)]">
                {daysLeft !== null && daysLeft >= 0 ? daysLeft : 0}
                <span className="ml-1.5 text-sm font-semibold text-[var(--muted)]">
                  {daysLeft !== null && daysLeft < 0 ? "days overdue" : "days left"}
                </span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                {sub.businessCount} of {sub.businessLimitAtPurchase} business{sub.businessLimitAtPurchase === 1 ? "" : "es"} used
                {sub.isComped ? " · comped" : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">No subscription found for this account.</p>
          )}

          {showContact && contact && (contact.phone || contact.email) && (
            <div className="mt-4 rounded-[14px] border border-[var(--warn-soft)] bg-[var(--warn-soft)] px-4 py-3 text-sm" style={{ color: "var(--warn)" }}>
              Renewing soon? Contact us to arrange payment and get a new key:
              <div className="mt-1 font-bold">
                {[contact.phone, contact.email].filter(Boolean).join(" · ")}
              </div>
            </div>
          )}
        </div>

        <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
          <h3 className="mb-1 font-display text-lg font-bold text-[var(--ink)]">Redeem an activation key</h3>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Got a key from the platform after confirming payment? Enter it below.
          </p>
          <div className="flex flex-col gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="KEY-XXXXXXXX"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-sm uppercase tracking-wider focus:border-[var(--brand)] focus:outline-none"
            />
            <button
              onClick={() => redeem.mutate(code)}
              disabled={redeem.isPending || !code.trim()}
              className="stamp-interactive rounded-[13px] py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {redeem.isPending ? "Activating…" : "Activate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
