import { useEffect, useRef, useState } from "react";
import { X, ScanLine, QrCode, Gift, Ticket, Copy, Check, ArrowRight } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useNavigate } from "@tanstack/react-router";

export function ScannerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [earnedVoucher, setEarnedVoucher] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setEarnedVoucher(null);
      setCopied(false);
      return;
    }

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let isMounted = true;
    let qrScanner: Html5Qrcode | null = null;

    if (!earnedVoucher) {
      try {
        qrScanner = new Html5Qrcode("qr-reader-viewport");
        scannerRef.current = qrScanner;

        qrScanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.75;
              return { width: size, height: size };
            },
          },
          async (decodedText) => {
            if (!isMounted) return;

            if (qrScanner && qrScanner.isScanning) {
              try {
                await qrScanner.stop();
              } catch (stopErr) {
                console.error("Error stopping scanner:", stopErr);
              }
            }

            const toastId = toast.loading("Claiming your loyalty stamp...");
            try {
              const response = await apiRequest<{ success: boolean; message: string; data?: { stampsEarned: number; rewardTriggered: boolean; voucherCode?: string } }>(
                "/api/stamps/claim",
                {
                  method: "POST",
                  body: { token: decodedText }
                }
              );

              if (response.success) {
                queryClient.invalidateQueries({ queryKey: ["stampCard"] });
                queryClient.invalidateQueries({ queryKey: ["vouchers"] });

                if (response.data && response.data.rewardTriggered === true) {
                  toast.success("Card completed!", { id: toastId });
                  setEarnedVoucher(response.data.voucherCode || "CAFE-REWARD");
                } else {
                  toast.success(response.message || "Stamp successfully claimed!", { id: toastId });
                  onClose();
                }
              } else {
                throw new Error(response.message || "Failed to claim stamp.");
              }
            } catch (err: any) {
              toast.error(err.message || "Failed to claim stamp.", { id: toastId });
              onClose();
            }
          },
          () => {
            // Silent failure
          }
        ).catch((err) => {
          if (!isMounted) return;
          console.error("Camera access failed:", err);
          toast.error("Camera access blocked. Please enable camera permission in settings.");
          onClose();
        });
      } catch (err) {
        console.error("Failed to initialize scanner:", err);
        toast.error("Failed to initialize camera scanner.");
        onClose();
      }
    }

    return () => {
      isMounted = false;
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;

      if (qrScanner) {
        scannerRef.current = null;
        if (qrScanner.isScanning) {
          qrScanner.stop().catch((stopErr) => {
            console.error("Error stopping camera stream on unmount:", stopErr);
          });
        }
      }
    };
  }, [open, onClose, queryClient, earnedVoucher]);

  const copyToClipboard = () => {
    if (!earnedVoucher) return;
    navigator.clipboard.writeText(earnedVoucher);
    setCopied(true);
    toast.success("Voucher code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGoToWallet = () => {
    onClose();
    navigate({ to: "/wallet" });
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={earnedVoucher ? "Congratulations Reward Screen" : "Scan Counter QR code"}
      className="fixed inset-0 z-50 bg-[#121212]/98 flex items-center justify-center font-sans text-[#EBE6DF]"
    >
      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center border border-[#2D2D2D] bg-[#1A1A1A] text-[#EBE6DF] hover:bg-[#EBE6DF] hover:text-black transition-colors rounded-[20px]"
      >
        <X className="h-5 w-5" strokeWidth={2} />
      </button>

      {earnedVoucher ? (
        <div className="w-full max-w-sm px-6 text-center text-[#EBE6DF]">
          {/* Celebrating icon */}
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center border border-[#2D2D2D] bg-[#1A1A1A] text-[#EBE6DF] animate-bounce rounded-[24px]">
            <Gift className="h-10 w-10 animate-pulse" strokeWidth={1.5} />
            <span className="absolute -top-1 -right-1 text-[#EBE6DF] text-lg animate-ping">✦</span>
          </div>

          <h2 
            className="mt-6 text-3xl font-normal text-[#EBE6DF] font-serif"
          >
            Congratulations!
          </h2>
          <p className="mt-2 text-sm text-[#A3A3A3]">
            You completed your punch card and earned a free coffee voucher!
          </p>

          {/* Ticket representation */}
          <div className="mt-8 relative overflow-hidden border border-[#2D2D2D] bg-[#1A1A1A] p-6 shadow-none rounded-[40px]">
            <div className="flex items-center justify-center gap-2 text-[#EBE6DF] text-xs font-bold uppercase tracking-wider">
              <Ticket className="h-4 w-4" />
              <span>Voucher Code</span>
            </div>

            <p className="mt-3 text-2xl font-mono font-bold tracking-widest text-[#EBE6DF] select-all">
              {earnedVoucher}
            </p>

            <button
              onClick={copyToClipboard}
              className="mt-4 inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#121212] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#EBE6DF] hover:bg-[#EBE6DF] hover:text-black transition-colors rounded-[20px] overflow-hidden"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#EBE6DF]" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-[#EBE6DF]/50" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-10 flex flex-col gap-3">
            <button
              onClick={handleGoToWallet}
              className="flex w-full items-center justify-center gap-2 bg-[#EBE6DF] py-4 text-sm font-bold uppercase tracking-wider text-black border border-[#EBE6DF] hover:opacity-90 active:scale-98 transition-all"
            >
              Go to Wallet
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="text-xs font-bold uppercase tracking-widest border border-[#2D2D2D] bg-[#1A1A1A] py-3 text-[#EBE6DF] hover:bg-[#EBE6DF] hover:text-black transition-colors rounded-[24px]"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        /* Regular Camera QR scanner view */
        <div className="flex h-full flex-col items-center justify-center px-6 text-[#EBE6DF] w-full">
          <div className="mb-6 text-center">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#A3A3A3] font-bold">
              Cafe Coffesarowar
            </p>
            <h2
              className="mt-1 text-2xl font-normal text-[#EBE6DF] font-serif"
            >
              Scan Counter QR
            </h2>
          </div>

          {/* Viewport Frame */}
          <div className="relative aspect-square w-full max-w-[300px] overflow-hidden border border-[#2D2D2D] bg-[#1A1A1A] rounded-[40px]">
            <div id="qr-reader-viewport" className="absolute inset-0 h-full w-full overflow-hidden [&>video]:h-full [&>video]:w-full [&>video]:object-cover" />

            <div className="pointer-events-none absolute inset-6 overflow-hidden z-10">
              <div
                className="absolute left-0 right-0 h-[2px] bg-[#EBE6DF]"
                style={{ animation: "scan-line 2.2s ease-in-out infinite" }}
              />
            </div>

            <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-25">
              <QrCode className="h-12 w-12 text-[#EBE6DF]" strokeWidth={1.2} />
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 text-sm text-[#A3A3A3]">
            <ScanLine className="h-4 w-4 text-[#EBE6DF]" />
            <span>Align QR inside the frame to collect a stamp</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-10 border border-[#2D2D2D] bg-[#1A1A1A] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#EBE6DF] transition-colors hover:bg-[#EBE6DF] hover:text-black rounded-[24px]"
          >
            Cancel
          </button>
        </div>
      )}

      <style>{`
        @keyframes scan-line {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          50% { top: 100%; opacity: 1; }
          60% { opacity: 0; }
          100% { top: 0%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
