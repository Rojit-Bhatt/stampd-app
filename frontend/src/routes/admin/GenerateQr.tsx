import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Zap, QrCode } from "lucide-react";
import { motion } from "motion/react";
import toast from "react-hot-toast";

import { apiRequest } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { useTenant } from "../../context/TenantContext";
import { tenantUrl } from "../../lib/tenantPath";
import { formatNpr } from "../../lib/subscription";
import { formatPoints } from "../../hooks/usePoints";
import { useCampaigns } from "../../hooks/useCampaigns";
import { useMotion } from "../../lib/motion";
import { CountdownRing } from "../../components/admin/CountdownRing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// The busiest screen in the product: staff enters the bill, the customer scans
// with their phone's own camera app (not an in-app scanner) — the QR encodes a
// URL to /[company]/[outlet]/claim, not the bare token, so opening it works
// from anywhere with no app installed.
//
// The bill comes FIRST and is mandatory: points are a percentage of what was
// actually paid, so there is no code to generate until we know the amount.
// The server enforces this too; this just stops staff hitting a 400.

export default function GenerateQr() {
  const { companySlug, outletSlug } = useTenant();
  const { data: settings } = useAdminSettings();
  const { data: campaigns = [] } = useCampaigns();
  const m = useMotion();
  const earnPercent = settings?.programResolved?.earnPercent ?? 100;

  // The server is authoritative and recomputes this at claim time; this is
  // so staff can see what the customer is about to get before they scan.
  // Overlapping campaigns don't stack — the biggest wins.
  const liveCampaign = campaigns
    .filter((c) => c.isLive)
    .reduce<(typeof campaigns)[number] | null>(
      (best, c) => (!best || c.multiplier > best.multiplier ? c : best),
      null,
    );
  const multiplier = liveCampaign?.multiplier ?? 1;

  const [token, setToken] = useState<string | null>(null);
  const [ttl, setTtl] = useState(0);
  const [issuedTtl, setIssuedTtl] = useState(30);
  const [loading, setLoading] = useState(false);
  const [billAmount, setBillAmount] = useState("");
  const [issuedFor, setIssuedFor] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parsedAmount = Number(billAmount);
  const amountValid = billAmount !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const pointsPreview = amountValid ? Math.round(parsedAmount * earnPercent * multiplier) / 100 : 0;

  const generate = useCallback(async (amount: number) => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        data: { token: string; billAmount: number; expiresInSeconds: number };
      }>("/api/admin/generate-qr", {
        method: "POST",
        role: "admin",
        body: { billAmount: amount },
      });
      setToken(res.data.token);
      setIssuedFor(res.data.billAmount);
      setTtl(res.data.expiresInSeconds);
      setIssuedTtl(res.data.expiresInSeconds);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't generate a code — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ttl <= 0) return;
    timerRef.current = setInterval(() => setTtl((t) => Math.max(0, t - 1)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token, ttl > 0]);

  const expired = ttl <= 0;
  const live = token && !expired;

  return (
    <div className="mx-auto max-w-[480px]">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Earn code</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter the bill, then have the customer scan.
        </p>
      </header>

      {/* A live campaign changes what the bill is worth, so it sits above the
          input rather than beside the result — staff should know before they
          quote a number, not after. */}
      {liveCampaign && (
        <div className="mb-4 flex items-center gap-2.5 rounded-[var(--radius-btn)] bg-[var(--primary-soft)] px-4 py-3">
          <Zap className="h-4 w-4 shrink-0 text-[var(--primary-deep)]" />
          <span className="text-sm font-bold text-[var(--primary-deep)]">
            {liveCampaign.multiplier}× points on right now — {liveCampaign.name}
          </span>
        </div>
      )}

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
            Bill amount
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--soft)]">
              Rs
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              value={billAmount}
              onChange={(e) => setBillAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && amountValid && !loading) generate(parsedAmount);
              }}
              placeholder="What did they pay?"
              className="h-14 pl-11 text-lg font-semibold"
            />
          </div>
        </label>

        {/* The award preview. Serif numeral, because this is the figure the
            customer is about to be promised. */}
        <div className="mt-3 flex min-h-[46px] items-center gap-3 border-t border-[var(--line)] pt-3">
          {amountValid ? (
            <>
              <div className="font-numeral text-3xl leading-none text-[var(--primary)]">
                {formatPoints(pointsPreview)}
              </div>
              <div className="text-xs leading-snug text-[var(--muted)]">
                points · {earnPercent}% back
                {liveCampaign && (
                  <>
                    {" "}
                    <span className="font-bold text-[var(--primary-deep)]">
                      · {liveCampaign.multiplier}× {liveCampaign.name}
                    </span>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--soft)]">
              Required — points are a share of the bill.
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-center">
          <div className="grid h-[236px] w-[236px] place-items-center rounded-[var(--radius-card)] border border-[var(--line)] bg-white p-4">
            {live ? (
              <motion.div
                key={token}
                initial={m.pick({ scale: 0.94, opacity: 0 }, { opacity: 0 })}
                animate={{ scale: 1, opacity: 1 }}
                transition={m.spring("cardEnter")}
              >
                <QRCodeSVG
                  value={`${tenantUrl(window.location.origin, companySlug, outletSlug, "claim")}?token=${encodeURIComponent(token)}`}
                  size={200}
                  level="M"
                  fgColor="#14201C"
                />
              </motion.div>
            ) : (
              <div className="flex flex-col items-center gap-2.5 px-4 text-center">
                <QrCode className="h-8 w-8 text-[var(--soft)]" strokeWidth={1.5} />
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {loading
                    ? "Generating…"
                    : token
                      ? "Code expired"
                      : "Enter a bill to generate"}
                </span>
                {token && !loading && (
                  <span className="text-xs text-[var(--muted)]">
                    Generate a fresh one — it only takes a tap.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {live && (
          <div className="mt-5 flex items-center justify-center gap-4">
            <CountdownRing remaining={ttl} total={issuedTtl} />
            <div className="text-left">
              <div className="text-[13px] leading-snug text-[var(--muted)]">
                seconds until
                <br />
                this code expires
              </div>
              {issuedFor !== null && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="neutral">For {formatNpr(issuedFor)}</Badge>
                  {liveCampaign && (
                    <Badge variant="live">{liveCampaign.multiplier}×</Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <Button
          onClick={() => generate(parsedAmount)}
          disabled={loading || !amountValid}
          size="lg"
          className="mt-6 w-full"
        >
          {token ? "Generate new code" : "Generate code"}
        </Button>
      </div>

      <p className="mt-4 text-center text-[13px] text-[var(--soft)]">
        Single-use — stops screenshots being re-scanned.
      </p>
    </div>
  );
}
