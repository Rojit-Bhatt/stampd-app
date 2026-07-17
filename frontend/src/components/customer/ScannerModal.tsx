import { useEffect, useRef, useState } from "react";
import { X, ScanLine, QrCode, CameraOff } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../../context/TenantContext";
import { PointsCelebration } from "./PointsCelebration";
import { tenantPath } from "../../lib/tenantPath";

interface EarnResult {
  pointsEarned: number;
  billAmount: number;
  balance: number;
  multiplier?: number;
  campaignName?: string | null;
}

export function ScannerModal({
  open,
  onClose,
  slug,
  tenantName,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  tenantName: string;
}) {
  const { companySlug } = useTenant();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [earned, setEarned] = useState<EarnResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!open) {
      setEarned(null);
      setCameraError(null);
      setIsBlocked(false);
      return;
    }

    let active = true;
    let statusRef: PermissionStatus | null = null;

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "camera" as any })
        .then((status) => {
          if (!active) return;
          statusRef = status;

          if (status.state === "denied") {
            setCameraError("Camera access has been denied in browser settings.");
            setIsBlocked(true);
          } else {
            setIsBlocked(false);
          }

          status.onchange = () => {
            if (!active) return;
            if (status.state === "denied") {
              setCameraError("Camera access has been denied in browser settings.");
              setIsBlocked(true);
            } else if (status.state === "granted" || status.state === "prompt") {
              setCameraError(null);
              setIsBlocked(false);
            }
          };
        })
        .catch((err) => {
          console.warn("Permissions API query for camera failed:", err);
        });
    }

    return () => {
      active = false;
      if (statusRef) {
        statusRef.onchange = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let isMounted = true;
    let qrScanner: Html5Qrcode | null = null;

    if (!earned && !cameraError) {
      try {
        qrScanner = new Html5Qrcode("qr-reader-viewport");
        scannerRef.current = qrScanner;

        qrScanner
          .start(
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

              // GenerateQr now encodes a full /:slug/claim?token=... URL (so
              // scanning with the phone's own camera app opens the seamless
              // claim landing page) — the in-app scanner decodes the same
              // image, so extract the raw token from it. Falls back to
              // decodedText itself for robustness (e.g. an old-style bare
              // token, in case a stale/cached QR is scanned).
              let rawToken = decodedText;
              let isRedeem = false;
              try {
                const url = new URL(decodedText);
                rawToken = url.searchParams.get("token") || decodedText;
                // Staff can put up either QR. A redeem code isn't something
                // to claim — it opens the catalog so the customer picks what
                // to spend on, so hand it off rather than posting an earn.
                isRedeem = url.pathname.endsWith("/redeem");
              } catch {
                // Not a URL — decodedText is already the raw token.
              }

              if (isRedeem) {
                onClose();
                navigate(`${tenantPath(companySlug, slug, "redeem")}?token=${encodeURIComponent(rawToken)}`);
                return;
              }

              const toastId = toast.loading("Adding your points…");
              try {
                const response = await apiRequest<{
                  success: boolean;
                  message: string;
                  data?: EarnResult;
                }>("/api/points/claim", {
                  method: "POST",
                  body: { token: rawToken },
                });

                if (response.success && response.data) {
                  queryClient.invalidateQueries({ queryKey: ["pointsBalance"] });
                  queryClient.invalidateQueries({ queryKey: ["pointsHistory"] });
                  toast.dismiss(toastId);
                  setEarned(response.data);
                } else {
                  throw new Error(response.message || "Couldn't add those points — try again.");
                }
              } catch (err) {
                toast.error((err as Error).message || "Couldn't add those points — try again.", { id: toastId });
                onClose();
              }
            },
            () => {
              // Silent failure
            },
          )
          .catch((err) => {
            if (!isMounted) return;
            console.error("Camera access failed:", err);
            
            const errName = err?.name || "";
            const errMsg = err?.message || String(err);
            const isPermissionError =
              errName === "NotAllowedError" ||
              errName === "PermissionDeniedError" ||
              errMsg.toLowerCase().includes("denied") ||
              errMsg.toLowerCase().includes("not allowed") ||
              errMsg.toLowerCase().includes("permission");

            setCameraError(errMsg);
            if (isPermissionError) {
              setIsBlocked(true);
            }
          });
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to initialize scanner:", err);
        setCameraError((err as Error).message || String(err));
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
  }, [open, onClose, queryClient, navigate, companySlug, slug, earned, cameraError]);

  const handleRetry = () => {
    setCameraError(null);
    setIsBlocked(false);
  };

  const handleGoToHistory = () => {
    onClose();
    navigate(tenantPath(companySlug, slug, "history"));
  };

  if (!open) return null;

  if (earned) {
    return (
      <PointsCelebration
        variant="earn"
        points={earned.pointsEarned}
        billAmount={earned.billAmount}
        balance={earned.balance}
        multiplier={earned.multiplier}
        campaignName={earned.campaignName}
        onDone={onClose}
        doneLabel="Done"
        onSecondary={handleGoToHistory}
        secondaryLabel="See my history"
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan Counter QR code"
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

      {cameraError ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-[#EBE6DF] w-full max-w-sm animate-fade-in text-center">
          {/* Visual Icon */}
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center border border-[#2D2D2D] bg-[#1A1A1A] text-[#EBE6DF] rounded-[24px]">
            {isBlocked ? (
              <CameraOff className="h-10 w-10 text-amber-500/90 animate-pulse" strokeWidth={1.5} />
            ) : (
              <ScanLine className="h-10 w-10 text-[#EBE6DF]" strokeWidth={1.5} />
            )}
          </div>

          <h2 className="mt-6 text-2xl font-normal text-[#EBE6DF] font-serif">
            {isBlocked ? "Camera Access Blocked" : "Camera Access Needed"}
          </h2>
          
          <p className="mt-3 text-sm text-[#A3A3A3] leading-relaxed">
            {isBlocked ? (
              "Camera is blocked for this site — check your browser's address bar or settings to allow it, then try again."
            ) : (
              "Please allow camera access to scan the counter's code."
            )}
          </p>

          <div className="mt-8 w-full space-y-3">
            <button
              type="button"
              onClick={handleRetry}
              className="flex w-full items-center justify-center gap-2 bg-[#EBE6DF] py-4 text-sm font-bold uppercase tracking-wider text-black border border-[#EBE6DF] hover:opacity-90 active:scale-98 transition-all rounded-[24px]"
            >
              {isBlocked ? "Enable Camera" : "Try Again"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full border border-[#2D2D2D] bg-[#1A1A1A] py-3 text-xs font-bold uppercase tracking-[0.18em] text-[#EBE6DF] transition-colors hover:bg-[#EBE6DF] hover:text-black rounded-[24px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Regular Camera QR scanner view */
        <div className="flex h-full flex-col items-center justify-center px-6 text-[#EBE6DF] w-full">
          <div className="mb-6 text-center">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#A3A3A3] font-bold">
              {tenantName}
            </p>
            <h2 className="mt-1 text-2xl font-normal text-[#EBE6DF] font-serif">Scan Counter QR</h2>
          </div>

          {/* Viewport Frame */}
          <div className="relative aspect-square w-full max-w-[300px] overflow-hidden border border-[#2D2D2D] bg-[#1A1A1A] rounded-[40px]">
            <div
              id="qr-reader-viewport"
              className="absolute inset-0 h-full w-full overflow-hidden [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
            />

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

          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-[#A3A3A3]">
              <ScanLine className="h-4 w-4 text-[#EBE6DF]" />
              <span>Align the counter's QR inside the frame</span>
            </div>
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
export default ScannerModal;
