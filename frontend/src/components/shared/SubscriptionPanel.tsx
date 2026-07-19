import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Phone, KeyRound, Check } from "lucide-react";

interface SubscriptionSummary {
  planSlug: string;
  status: string;
  effectiveStatus: "trialing" | "active" | "grace" | "expired" | "canceled" | "none";
  outletLimitAtPurchase: number;
  outletCount: number;
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
  canceled: { bg: "var(--surface-2)", fg: "var(--soft)" },
  none: { bg: "var(--surface-2)", fg: "var(--soft)" },
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
  role: "company" | "admin";
  // Extra query-key prefixes to invalidate on a successful redemption — e.g.
  // "adminSettings" so AdminLayout's reminder banner (which reads settings,
  // not this panel's own query) refreshes too. Matched by predicate since
  // that key also carries a dynamic orgId segment.
  extraInvalidateKeyPrefixes?: string[];
}

// The company owner's subscription surface. Kept as a shared component
// because the same shape may need rendering read-only elsewhere later; it
// always funnels through subscriptionService.getSubscriptionSummary
// server-side.
export function SubscriptionPanel({ queryKey, fetchPath, redeemPath, role, extraInvalidateKeyPrefixes }: SubscriptionPanelProps) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [activatedUntil, setActivatedUntil] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SubscriptionResponse>({
    queryKey: [queryKey],
    queryFn: () => apiRequest<SubscriptionResponse>(fetchPath, { role }),
  });

  const redeem = useMutation({
    mutationFn: (keyCode: string) => apiRequest(redeemPath, { method: "POST", role, body: { code: keyCode } }),
    onSuccess: (res: any) => {
      // Show the new expiry back, not just "activated" — the whole reason
      // someone types a key is to find out how long they now have.
      setActivatedUntil(res?.subscription?.currentPeriodEnd ?? null);
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
        <Skeleton className="h-48 rounded-[var(--radius-card)]" />
        <Skeleton className="h-48 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  const sub = data?.subscription;
  const effectiveStatus = sub?.effectiveStatus || "none";
  const statusColor = STATUS_COLOR[effectiveStatus] || STATUS_COLOR.none;
  const daysLeft = sub?.daysUntilExpiry ?? null;
  const showContact = data?.reminder?.show;
  const contact = data?.platformContact;

  const periodEnd = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  // Progress toward expiry, for the countdown bar. A year is the longest
  // plan sold, so that's the window the bar is drawn against.
  const YEAR_DAYS = 365;
  const daysPct =
    daysLeft !== null ? Math.max(0, Math.min(100, (daysLeft / YEAR_DAYS) * 100)) : 0;

  // A grandfathered or comped subscription carries a sentinel period end
  // decades out. Rendering that as "36500 days left" next to a full bar is
  // technically true and completely useless — it reads as a bug. Anything
  // beyond two years is not a countdown anybody is counting.
  const PERPETUAL_DAYS = YEAR_DAYS * 2;
  const isPerpetual = daysLeft !== null && daysLeft > PERPETUAL_DAYS;

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Subscription</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">
        Renewals are arranged with us directly — there's no card on file.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold text-[var(--ink)]">
              {humanizePlanSlug(sub?.planSlug || "")}
            </h3>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: statusColor.bg, color: statusColor.fg }}
            >
              {STATUS_LABEL[effectiveStatus] || effectiveStatus}
            </span>
          </div>

          {sub ? (
            <>
              {isPerpetual ? (
                <div className="font-display text-2xl font-bold text-[var(--ink)]">
                  No expiry
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-numeral text-[44px] leading-none text-[var(--ink)]">
                      {daysLeft !== null && daysLeft >= 0 ? daysLeft : Math.abs(daysLeft ?? 0)}
                    </span>
                    <span className="text-sm font-semibold text-[var(--muted)]">
                      {daysLeft !== null && daysLeft < 0 ? "days overdue" : "days left"}
                    </span>
                  </div>
                  <Progress value={daysPct} tone="time" className="mt-3" />
                </>
              )}

              <p className="mt-3 text-sm text-[var(--muted)]">
                {isPerpetual ? "" : periodEnd ? `Runs to ${periodEnd}. ` : ""}
                {sub.outletCount} of {sub.outletLimitAtPurchase} outlet
                {sub.outletLimitAtPurchase === 1 ? "" : "s"} used
                {sub.isComped ? " · comped" : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">No subscription found for this company.</p>
          )}

          {showContact && contact && (contact.phone || contact.email) && (
            <div
              className="mt-4 rounded-[var(--radius-btn)] bg-[var(--warn-soft)] px-4 py-3 text-sm"
              style={{ color: "var(--warn)" }}
            >
              <div className="flex items-center gap-2 font-bold">
                <Phone className="h-4 w-4" /> Time to renew
              </div>
              <p className="mt-1">Get in touch and we'll arrange payment and send a new key.</p>
              <div className="mt-1.5 font-bold">
                {[contact.phone, contact.email].filter(Boolean).join(" · ")}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
          {activatedUntil ? (
            /* Success gets its own state rather than a toast that vanishes:
               the one thing you wanted to know is the new date. */
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)]">
                <Check className="h-6 w-6 text-[var(--primary-deep)]" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-[var(--ink)]">
                Subscription activated
              </h3>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                You're covered to{" "}
                <span className="font-bold text-[var(--ink)]">
                  {new Date(activatedUntil).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                .
              </p>
              <Button variant="ghost" className="mt-4" onClick={() => setActivatedUntil(null)}>
                Enter another key
              </Button>
            </div>
          ) : (
            <>
              <h3 className="font-display text-lg font-bold text-[var(--ink)]">
                Activate with a key
              </h3>

              {/* Three steps, stated plainly. Paying a person and typing a
                  code you were handed is an unusual flow, and an unexplained
                  code box invites the suspicion that something is missing. */}
              <ol className="mt-4 flex flex-col gap-3">
                {[
                  { Icon: Phone, text: "Talk to us and pay however suits you — bank, wallet or cash." },
                  { Icon: ShieldCheck, text: "We confirm the payment and issue you a key." },
                  { Icon: KeyRound, text: "Enter it below. Your plan starts the moment it's accepted." },
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-numeral text-sm text-[var(--muted)]">
                      {i + 1}
                    </span>
                    <span className="text-[13px] leading-snug text-[var(--muted)]">{step.text}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-5 flex flex-col gap-2.5">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
                    Activation key
                  </span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="KEY-XXXXXXXX"
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 font-mono text-base uppercase tracking-[0.18em] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
                  />
                </label>
                <Button
                  onClick={() => redeem.mutate(code)}
                  disabled={redeem.isPending || !code.trim()}
                  size="lg"
                >
                  {redeem.isPending ? "Activating…" : "Activate"}
                </Button>
              </div>

              <div className="mt-4 flex items-start gap-2 border-t border-[var(--line)] pt-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
                <p className="text-xs leading-snug text-[var(--soft)]">
                  Keys are only ever issued by Stampd. We never ask for card or bank details
                  here, and nobody else can activate your plan.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
