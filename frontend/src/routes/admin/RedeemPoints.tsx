import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Gift } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { useTenant } from "../../context/TenantContext";
import { tenantUrl } from "../../lib/tenantPath";

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

  const [token, setToken] = useState<string | null>(null);
  const [ttl, setTtl] = useState(0);
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
    <div className="mx-auto max-w-[460px] text-center">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Redeem code</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">
        Put this up and let the customer scan — they pick their reward.
      </p>

      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-ambient">
        <div className="mx-auto flex h-[230px] w-[230px] items-center justify-center rounded-[18px] border border-[var(--line)] bg-white p-4">
          {live ? (
            <QRCodeSVG
              value={`${tenantUrl(window.location.origin, companySlug, outletSlug, "redeem")}?token=${encodeURIComponent(token)}`}
              size={198}
              level="M"
              fgColor="#241E1B"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[var(--soft)]">
              <Gift className="h-8 w-8" />
              <span className="text-sm font-bold text-[var(--ink)]">
                {loading ? "Generating…" : token ? "Code expired" : "Generate a code to start"}
              </span>
            </div>
          )}
        </div>

        {live && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <span
              className="flex items-center justify-center rounded-full border-4 font-display text-lg font-extrabold"
              style={{ width: 54, height: 54, borderColor: "var(--brand)", color: "var(--brand)" }}
            >
              {ttl}
            </span>
            <span className="text-left text-[13px] text-[var(--muted)]">
              seconds until
              <br />
              this code expires
            </span>
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading}
          className="mt-6 w-full rounded-[14px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {token ? "Generate new code" : "Generate redeem code"}
        </button>
      </div>

      <p className="mt-4 text-[13px] text-[var(--soft)]">
        One code, one redemption. The points come off as soon as they choose —
        check the transaction history if you need to confirm it went through.
      </p>
    </div>
  );
}
