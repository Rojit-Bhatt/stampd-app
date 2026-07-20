import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Gift, Loader2, MailWarning } from "lucide-react";
import toast from "react-hot-toast";
import { useTenant } from "../context/TenantContext";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { usePointsBalance, useRewardCatalog, formatPoints } from "../hooks/usePoints";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";
import { RedeemCelebration } from "../components/customer/RedeemCelebration";
import { Skeleton } from "../components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/** A catalog row awaiting confirmation. */
interface PendingReward {
  id: string;
  name: string;
  pointsPrice: number;
}

interface RedeemResult {
  success: boolean;
  message: string;
  data: { rewardName: string; pointsSpent: number; balance: number };
}

// Where the staff-initiated redeem QR lands. The token is only consumed when
// the customer actually picks something — scanning alone must not spend
// anything, since the whole point of showing the catalog here is that they
// choose after scanning.
export default function RedeemLanding() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenant, companySlug, outletSlug } = useTenant();
  const { globalAccount } = useCustomerAuth();

  const { data: points, isLoading: balanceLoading } = usePointsBalance();
  const { data: catalog = [], isLoading: catalogLoading } = useRewardCatalog();
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingReward | null>(null);
  const [result, setResult] = useState<RedeemResult["data"] | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);

  const balance = points?.balance ?? 0;

  if (!token) {
    return (
      <Shell title="No redeem code" backTo={tenantPath(companySlug, outletSlug)}>
        <p className="text-sm text-[var(--muted)]">
          Ask the counter to bring up the redeem QR, then scan it with your camera.
        </p>
      </Shell>
    );
  }

  if (!globalAccount) {
    return (
      <Shell title="Sign in to redeem" backTo={tenantPath(companySlug, outletSlug)}>
        <p className="mb-5 text-sm text-[var(--muted)]">
          Your points live with your account — sign in and scan again.
        </p>
        <Button asChild size="lg">
          <Link to="/customer-login">Sign in</Link>
        </Button>
      </Shell>
    );
  }

  const redeem = async (itemId: string) => {
    setRedeeming(itemId);
    try {
      const res = await apiRequest<RedeemResult>("/api/points/redeem", {
        method: "POST",
        body: { token, itemId },
      });
      setResult(res.data);
      setPending(null);
      qc.invalidateQueries({ queryKey: ["pointsBalance"] });
      qc.invalidateQueries({ queryKey: ["pointsHistory"] });
    } catch (err: any) {
      // The one refusal that has a fix the customer can act on right here.
      // A toast would be wrong for it: it disappears, and the thing it's
      // asking for takes a trip to another app.
      if (err.code === "EMAIL_NOT_VERIFIED") {
        setPending(null);
        setNeedsVerification(true);
      } else {
        toast.error(err.message || "Couldn't redeem that — try again.");
      }
    } finally {
      setRedeeming(null);
    }
  };

  if (needsVerification) {
    return (
      <Shell title="Verify your email first" backTo={tenantPath(companySlug, outletSlug, "dashboard")}>
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-6 shadow-ambient">
          <span
            className="mb-4 flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
          >
            <MailWarning className="h-5 w-5" />
          </span>
          <p className="text-sm text-[var(--muted)]">
            Your {formatPoints(balance)} points are safe — we just need to know this email is
            really yours before you spend them. Tap the link we sent to{" "}
            <span className="font-semibold text-[var(--ink)]">{globalAccount.email}</span>, then
            scan the counter's code again.
          </p>
          <Button
            size="lg"
            className="mt-5 w-full"
            disabled={resending}
            onClick={async () => {
              setResending(true);
              try {
                await apiRequest("/api/customer-auth/resend-verification", {
                  method: "POST",
                  body: { email: globalAccount.email },
                });
                toast.success("Sent — check your inbox.");
              } catch {
                toast.error("Couldn't resend that — try again in a bit.");
              } finally {
                setResending(false);
              }
            }}
          >
            {resending ? (
              <>
                <Loader2 className="animate-spin" /> Sending…
              </>
            ) : (
              "Resend the verification email"
            )}
          </Button>
        </div>
      </Shell>
    );
  }

  if (result) {
    return (
      <RedeemCelebration
        points={result.pointsSpent}
        rewardName={result.rewardName}
        balance={result.balance}
        // Derived, not read from the balance query: that query is invalidated
        // by the redemption, so reading it here would race the refetch and
        // sometimes tick down from the figure we're already showing.
        balanceBefore={result.balance + result.pointsSpent}
        onDone={() => navigate(tenantPath(companySlug, outletSlug, "dashboard"))}
        doneLabel="Back to my points"
      />
    );
  }

  const loading = balanceLoading || catalogLoading;

  return (
    <Shell title={`Redeem at ${tenant?.name ?? "this outlet"}`} backTo={tenantPath(companySlug, outletSlug, "dashboard")}>
      {/* Balance is value, so it's green and set in the numeral face — the
          same treatment it gets everywhere else in the app. */}
      <div className="mb-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-center shadow-ambient">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          Your balance
        </div>
        <div className="mt-1 font-numeral text-4xl leading-none text-[var(--primary)]">
          {loading ? <Skeleton className="mx-auto h-9 w-24" /> : formatPoints(balance)}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : catalog.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-center">
          <Gift className="mx-auto h-7 w-7 text-[var(--soft)]" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-[var(--muted)]">
            This outlet hasn't put any rewards up yet. Your points keep adding up in the meantime.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {catalog.map((item) => {
            const canAfford = item.pointsPrice <= balance;
            const short = item.pointsPrice - balance;
            return (
              <button
                key={item.id}
                onClick={() => setPending(item)}
                disabled={!canAfford || Boolean(redeeming)}
                className="stamp-interactive flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-left disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: canAfford ? "var(--primary-soft)" : "var(--surface-2)",
                    color: canAfford ? "var(--primary-deep)" : "var(--soft)",
                  }}
                >
                  <Gift className="h-4.5 w-4.5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--ink)]">
                    {item.name}
                  </span>
                  <span className="block truncate text-[13px] text-[var(--muted)]">
                    {canAfford
                      ? item.description || "Ready to redeem"
                      : `${formatPoints(short)} more points needed`}
                  </span>
                  {/* How close they are, for anything they can't afford yet.
                      An out-of-reach reward is a reason to come back, not a
                      dead row — but it must never look redeemable. */}
                  {!canAfford && (
                    <Progress
                      value={(balance / item.pointsPrice) * 100}
                      className="mt-2 h-1.5"
                    />
                  )}
                </span>

                <span
                  className="flex-shrink-0 font-numeral text-2xl leading-none"
                  style={{ color: canAfford ? "var(--primary)" : "var(--soft)" }}
                >
                  {formatPoints(item.pointsPrice)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-center text-xs text-[var(--muted)]">
        Pick one while you're at the counter — this code is good for one redemption.
      </p>

      {/* Spending points is irreversible and the balance is the whole point of
          the program, so it gets an explicit confirm showing the cost and what
          they'll have left. Previously one tap spent the points outright. */}
      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Redeem {pending?.name}?
            </DialogTitle>
            <DialogDescription>
              This spends points from your {tenant?.name ?? "outlet"} balance. You can't undo it.
            </DialogDescription>
          </DialogHeader>

          <div className="my-1 grid grid-cols-2 gap-3">
            <div className="rounded-[var(--radius-btn)] bg-[var(--surface-2)] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
                Cost
              </div>
              <div className="mt-0.5 font-numeral text-2xl leading-none text-[var(--ink)]">
                {pending ? formatPoints(pending.pointsPrice) : ""}
              </div>
            </div>
            <div className="rounded-[var(--radius-btn)] bg-[var(--surface-2)] px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
                Balance after
              </div>
              <div className="mt-0.5 font-numeral text-2xl leading-none text-[var(--ink)]">
                {pending ? formatPoints(balance - pending.pointsPrice) : ""}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:flex-col">
            <Button
              size="lg"
              className="w-full"
              disabled={Boolean(redeeming)}
              onClick={() => pending && redeem(pending.id)}
            >
              {redeeming ? (
                <>
                  <Loader2 className="animate-spin" /> Redeeming…
                </>
              ) : (
                "Confirm redemption"
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={Boolean(redeeming)}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({
  title,
  backTo,
  children,
}: {
  title: string;
  backTo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen justify-center bg-[var(--bg)] px-5 py-10">
      <div className="w-full max-w-md">
        <Link
          to={backTo}
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="mb-5 font-display text-2xl font-bold text-[var(--ink)]">{title}</h1>
        {children}
      </div>
    </div>
  );
}
