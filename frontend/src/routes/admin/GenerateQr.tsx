import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";

// Barista generates a short-lived, single-use stamp QR. The customer scans it.
export default function GenerateQr() {
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
      }>("/api/admin/generate-qr", { method: "POST", role: "admin" });
      setToken(res.data.token);
      setTtl(res.data.expiresInSeconds);
    } catch (err) {
      toast.error((err as Error).message || "Failed to generate code.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    generate();
  }, [generate]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ttl <= 0) return;
    timerRef.current = setInterval(() => setTtl((t) => Math.max(0, t - 1)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token, ttl > 0]);

  const expired = ttl <= 0;

  return (
    <div className="mx-auto max-w-[460px] text-center">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Stamp code</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">Have the customer scan this to earn one stamp.</p>

      <div className="rounded-[26px] border border-[var(--line)] bg-[var(--surface)] p-8 shadow-sm">
        <div className="mx-auto flex h-[230px] w-[230px] items-center justify-center rounded-[18px] border border-[var(--line)] bg-white p-4">
          {token && !expired ? (
            <QRCodeSVG value={token} size={198} level="M" fgColor="#241E1B" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[var(--soft)]">
              <span className="text-3xl">⏱</span>
              <span className="text-sm font-bold text-[var(--ink)]">
                {loading ? "Generating…" : "Code expired"}
              </span>
            </div>
          )}
        </div>

        {token && !expired && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <span
              className="flex h-13 w-13 items-center justify-center rounded-full border-4 font-display text-lg font-extrabold"
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
          Generate new code
        </button>
      </div>
      <p className="mt-4 text-[13px] text-[var(--soft)]">
        Short-lived codes stop customers from screenshotting and re-using them.
      </p>
    </div>
  );
}
