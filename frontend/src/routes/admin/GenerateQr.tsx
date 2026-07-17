import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { useTenant } from "../../context/TenantContext";
import { tenantUrl } from "../../lib/tenantPath";
import { formatNpr } from "../../lib/subscription";

// Staff enters the bill, then the customer scans with their phone's own
// camera app (not an in-app scanner) — the QR encodes a URL to
// /[company]/[outlet]/claim, not the bare token, so opening it works from
// anywhere with no app installed.
//
// The bill comes FIRST and is mandatory: points are a percentage of what was
// actually paid, so there is no code to generate until we know the amount.
// The server enforces this too; this just stops staff hitting a 400.
export default function GenerateQr() {
  const { companySlug, outletSlug } = useTenant();
  const { data: settings } = useAdminSettings();
  const earnPercent = settings?.programResolved?.earnPercent ?? 100;

  const [token, setToken] = useState<string | null>(null);
  const [ttl, setTtl] = useState(0);
  const [loading, setLoading] = useState(false);
  const [billAmount, setBillAmount] = useState("");
  const [issuedFor, setIssuedFor] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parsedAmount = Number(billAmount);
  const amountValid = billAmount !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const pointsPreview = amountValid ? Math.round(parsedAmount * earnPercent) / 100 : 0;

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
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Earn code</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">Enter the bill, then have the customer scan.</p>

      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-ambient">
        <label className="mb-4 block text-left">
          <span className="mb-1.5 block text-sm font-bold text-[var(--ink)]">Bill amount</span>
          <input
            type="number"
            min={0}
            step="0.01"
            autoFocus
            value={billAmount}
            onChange={(e) => setBillAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && amountValid && !loading) generate(parsedAmount);
            }}
            placeholder="What did they pay?"
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
          {amountValid ? (
            <span className="mt-1.5 block text-xs font-semibold text-[var(--muted)]">
              Earns <span style={{ color: "var(--brand)" }}>{pointsPreview}</span> points
              {earnPercent !== 100 ? ` (${earnPercent}% back)` : ""}
            </span>
          ) : (
            <span className="mt-1.5 block text-xs text-[var(--soft)]">
              Required — points are a share of the bill.
            </span>
          )}
        </label>

        <div className="mx-auto flex h-[230px] w-[230px] items-center justify-center rounded-[18px] border border-[var(--line)] bg-white p-4">
          {live ? (
            <QRCodeSVG
              value={`${tenantUrl(window.location.origin, companySlug, outletSlug, "claim")}?token=${encodeURIComponent(token)}`}
              size={198}
              level="M"
              fgColor="#241E1B"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[var(--soft)]">
              <span className="text-3xl">⏱</span>
              <span className="text-sm font-bold text-[var(--ink)]">
                {loading ? "Generating…" : token ? "Code expired" : "Enter a bill amount to generate"}
              </span>
            </div>
          )}
        </div>

        {live && (
          <>
            {issuedFor !== null && (
              <p className="mt-4 text-sm font-semibold text-[var(--ink)]">
                For a {formatNpr(issuedFor)} bill
              </p>
            )}
            <div className="mt-3 flex items-center justify-center gap-3">
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
          </>
        )}

        <button
          onClick={() => generate(parsedAmount)}
          disabled={loading || !amountValid}
          className="mt-6 w-full rounded-[14px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {token ? "Generate new code" : "Generate code"}
        </button>
      </div>
      <p className="mt-4 text-[13px] text-[var(--soft)]">
        Short-lived, single-use codes stop customers from screenshotting and re-using them.
      </p>
    </div>
  );
}
