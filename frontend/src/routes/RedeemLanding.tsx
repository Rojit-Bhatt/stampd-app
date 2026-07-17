import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTenant } from "../context/TenantContext";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { usePointsBalance, useRewardCatalog, formatPoints } from "../hooks/usePoints";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";
import { PointsCelebration } from "../components/customer/PointsCelebration";
import { Skeleton } from "../components/ui/skeleton";

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
  const [result, setResult] = useState<RedeemResult["data"] | null>(null);

  const balance = points?.balance ?? 0;

  if (!token) {
    return (
      <Shell title="No redeem code">
        <p className="text-sm text-[var(--muted)]">
          Ask the counter to bring up the redeem QR, then scan it with your camera.
        </p>
      </Shell>
    );
  }

  if (!globalAccount) {
    return (
      <Shell title="Sign in to redeem">
        <p className="mb-5 text-sm text-[var(--muted)]">
          Your points live with your account — sign in and scan again.
        </p>
        <Link
          to="/customer-login"
          className="stamp-interactive inline-block rounded-full px-6 py-3 text-sm font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          Sign in
        </Link>
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
      qc.invalidateQueries({ queryKey: ["pointsBalance"] });
      qc.invalidateQueries({ queryKey: ["pointsHistory"] });
    } catch (err: any) {
      toast.error(err.message || "Couldn't redeem that — try again.");
    } finally {
      setRedeeming(null);
    }
  };

  if (result) {
    return (
      <PointsCelebration
        variant="redeem"
        points={result.pointsSpent}
        rewardName={result.rewardName}
        balance={result.balance}
        onDone={() => navigate(tenantPath(companySlug, outletSlug, "dashboard"))}
        doneLabel="Back to my points"
      />
    );
  }

  const loading = balanceLoading || catalogLoading;

  return (
    <Shell title={`Redeem at ${tenant?.name ?? "this outlet"}`}>
      <div className="mb-5 rounded-3xl bg-[var(--surface-container)] px-5 py-4 text-center">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--soft)]">Your balance</div>
        <div className="mt-1 font-display text-3xl font-extrabold" style={{ color: "var(--brand)" }}>
          {loading ? <Skeleton className="mx-auto h-8 w-24" /> : formatPoints(balance)}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-3xl" />)}
        </div>
      ) : catalog.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          This outlet hasn't put any rewards up yet. Your points keep adding up in the meantime.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {catalog.map((item) => {
            const canAfford = item.pointsPrice <= balance;
            const busy = redeeming === item.id;
            return (
              <button
                key={item.id}
                onClick={() => redeem(item.id)}
                disabled={!canAfford || Boolean(redeeming)}
                className="stamp-interactive flex items-center gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-left disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: canAfford ? "var(--brand)" : "var(--surface-container)",
                    color: canAfford ? "#fff" : "var(--soft)",
                  }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[var(--ink)]">{item.name}</span>
                  <span className="block truncate text-[13px] text-[var(--muted)]">
                    {canAfford
                      ? item.description || "Ready to redeem"
                      : `${formatPoints(item.pointsPrice - balance)} more points needed`}
                  </span>
                </span>
                <span className="flex-shrink-0 text-sm font-bold" style={{ color: canAfford ? "var(--brand)" : "var(--soft)" }}>
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
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-[var(--bg)] px-5 py-10">
      <div className="w-full max-w-md">
        <h1 className="mb-5 font-display text-2xl font-extrabold text-[var(--ink)]">{title}</h1>
        {children}
      </div>
    </div>
  );
}
