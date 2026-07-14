import { useState } from "react";
import { Check, AlertTriangle, X } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";

type Result = { kind: "ok" | "used" | "none"; message: string } | null;

export default function RedeemVoucher() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const redeem = async () => {
    const voucherCode = code.trim().toUpperCase();
    if (!voucherCode) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        "/api/admin/redeem-voucher",
        { method: "POST", role: "admin", body: { voucherCode } },
      );
      setResult({ kind: "ok", message: res.message || "Voucher redeemed." });
      toast.success("Voucher redeemed 🎉");
      setCode("");
    } catch (err) {
      const message = (err as Error).message || "Redemption failed.";
      const kind = /not found/i.test(message) ? "none" : "used";
      setResult({ kind, message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[460px]">
      <h1 className="text-center font-display text-2xl font-extrabold text-[var(--ink)]">
        Redeem a voucher
      </h1>
      <p className="mb-6 mt-1 text-center text-[var(--muted)]">Enter the customer’s code.</p>

      <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex gap-2.5">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && redeem()}
            placeholder="e.g. COFF-7F3K2"
            className="flex-1 rounded-[13px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 font-mono text-[17px] uppercase tracking-[0.05em] text-[var(--ink)] placeholder:text-[var(--soft)] focus:border-[var(--brand)] focus:outline-none"
          />
          <button
            onClick={redeem}
            disabled={busy}
            className="rounded-[13px] px-6 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {busy ? "…" : "Redeem"}
          </button>
        </div>

        {result && (
          <div
            className="mt-5 rounded-[16px] border p-5 text-center"
            style={{
              background:
                result.kind === "ok"
                  ? "var(--ok-soft)"
                  : result.kind === "used"
                    ? "var(--warn-soft)"
                    : "var(--err-soft)",
              borderColor: "var(--line)",
            }}
          >
            <div
              className="mx-auto mb-3 flex h-13 w-13 items-center justify-center rounded-full text-white"
              style={{
                width: 52,
                height: 52,
                background:
                  result.kind === "ok"
                    ? "var(--ok)"
                    : result.kind === "used"
                      ? "var(--warn)"
                      : "var(--err)",
              }}
            >
              {result.kind === "ok" ? (
                <Check className="h-6 w-6" />
              ) : result.kind === "used" ? (
                <AlertTriangle className="h-6 w-6" />
              ) : (
                <X className="h-6 w-6" />
              )}
            </div>
            <div className="font-display text-[17px] font-extrabold text-[var(--ink)]">
              {result.kind === "ok" ? "Redeemed" : result.kind === "used" ? "Not redeemable" : "Not found"}
            </div>
            <div className="mt-1 text-[13px] text-[var(--muted)]">{result.message}</div>
          </div>
        )}
      </div>
    </div>
  );
}
