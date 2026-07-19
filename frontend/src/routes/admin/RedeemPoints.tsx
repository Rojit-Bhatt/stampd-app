import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Gift } from "lucide-react";
import { motion } from "motion/react";
import toast from "react-hot-toast";

import { apiRequest } from "../../lib/api";
import { useTenant } from "../../context/TenantContext";
import { tenantUrl } from "../../lib/tenantPath";
import { useMotion } from "../../lib/motion";
import { CountdownRing } from "../../components/admin/CountdownRing";
import { Button } from "@/components/ui/button";

// Redemption is staff-initiated, exactly like earning: staff puts this code
// up, the customer scans it and picks a reward from the catalog on their own
// phone. That ordering is the point — a customer can never move their own
// balance without someone at the counter, and staff never has to hunt for a
// code the customer read out.
//
// Replaces the old "type the voucher code" flow, which no longer has a
// subject: there are no voucher codes, only a balance.
export default function RedeemPoints() {
  const { companySlug, outletSlug } = useTenant();
  const m = useMotion();

  const [token, setToken] = useState<string | null>(null);
  const [ttl, setTtl] = useState(0);
  const [issuedTtl, setIssuedTtl] = useState(30);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        data: { token: string; expiresInSeconds: number };
      }>("/api/admin/generate-redeem-qr", { method: "POST", role: "admin" });
      setToken(res.data.token);
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
        <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Redeem code</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Put this up — the customer scans and picks their reward.
        </p>
      </header>

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <div className="flex justify-center">
          <div className="grid h-[236px] w-[236px] place-items-center rounded-[var(--radius-card)] border border-[var(--line)] bg-white p-4">
            {live ? (
              <motion.div
                key={token}
                initial={m.pick({ scale: 0.94, opacity: 0 }, { opacity: 0 })}
                animate={{ scale: 1, opacity: 1 }}
                transition={m.spring("cardEnter")}
              >
                <QRCodeSVG
                  value={`${tenantUrl(window.location.origin, companySlug, outletSlug, "redeem")}?token=${encodeURIComponent(token)}`}
                  size={200}
                  level="M"
                  fgColor="#14201C"
                />
              </motion.div>
            ) : (
              <div className="flex flex-col items-center gap-2.5 px-4 text-center">
                <Gift className="h-8 w-8 text-[var(--soft)]" strokeWidth={1.5} />
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {loading ? "Generating…" : token ? "Code expired" : "Generate a code to start"}
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
            <span className="text-left text-[13px] leading-snug text-[var(--muted)]">
              seconds until
              <br />
              this code expires
            </span>
          </div>
        )}

        <Button onClick={generate} disabled={loading} size="lg" className="mt-6 w-full">
          {token ? "Generate new code" : "Generate redeem code"}
        </Button>
      </div>

      <p className="mt-4 text-center text-[13px] text-[var(--soft)]">
        One code, one redemption — points come off the instant they choose.
      </p>
    </div>
  );
}
