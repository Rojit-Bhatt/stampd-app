import { useEffect, useRef, useState } from "react";
import { X, ScanLine, QrCode, CameraOff } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../../context/TenantContext";
import { tenantPath } from "../../lib/tenantPath";

// Where a scanned code should land. Staff QRs encode a full
// /[company]/[outlet]/(claim|redeem)?token=... URL; the outlet in THAT path
// is the one the token belongs to, which need not be the outlet currently
// open in the app. Only the path is kept — never the host — so a QR can't
// send the customer off-site. A bare token (old-style code) is treated as an
// earn at the current outlet.
export function scanDestination(decodedText: string, companySlug: string, outletSlug: string): string {
  try {
    const url = new URL(decodedText);
    const token = url.searchParams.get("token");
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(claim|redeem)\/?$/);
    if (token && match) {
      return `/${match[1]}/${match[2]}/${match[3]}?token=${encodeURIComponent(token)}`;
    }
    if (token) {
      const kind = url.pathname.endsWith("/redeem") ? "redeem" : "claim";
      return `${tenantPath(companySlug, outletSlug, kind)}?token=${encodeURIComponent(token)}`;
    }
  } catch {
    // Not a URL — decodedText is the raw token itself.
  }
  return `${tenantPath(companySlug, outletSlug, "claim")}?token=${encodeURIComponent(decodedText.trim())}`;
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
  const navigate = useNavigate();

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!open) {
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

    if (!cameraError) {
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

              // Every scan lands on the same page the phone's own camera
              // opens. ClaimLanding converts the 30-second earn token into a
              // 15-minute PendingClaim the moment it loads, switches the
              // session to the QR's outlet, and handles the phone step — the
              // old in-app path POSTed the raw token against whichever
              // outlet was open (another outlet's QR -> "Invalid QR token")
              // and retried it after the phone step, by which time a
              // 30-second token had usually expired.
              onClose();
              navigate(scanDestination(decodedText, companySlug, slug));
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
  }, [open, onClose, navigate, companySlug, slug, cameraError]);

  const handleRetry = () => {
    setCameraError(null);
    setIsBlocked(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan Counter QR code"
      className="fixed inset-0 z-50 bg-[#0C110F]/98 flex items-center justify-center font-sans text-[#E9F0EC]"
    >
      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center border border-[#223029] bg-[#141B18] text-[#E9F0EC] hover:bg-[#E9F0EC] hover:text-black transition-colors rounded-[var(--radius-btn)]"
      >
        <X className="h-5 w-5" strokeWidth={2} />
      </button>

      {cameraError ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-[#E9F0EC] w-full max-w-sm animate-fade-in text-center">
          {/* Visual Icon */}
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center border border-[#223029] bg-[#141B18] text-[#E9F0EC] rounded-[var(--radius-card)]">
            {isBlocked ? (
              <CameraOff className="h-10 w-10 text-amber-500/90 animate-pulse" strokeWidth={1.5} />
            ) : (
              <ScanLine className="h-10 w-10 text-[#E9F0EC]" strokeWidth={1.5} />
            )}
          </div>

          <h2 className="mt-6 text-2xl font-normal text-[#E9F0EC] font-display">
            {isBlocked ? "Camera Access Blocked" : "Camera Access Needed"}
          </h2>
          
          <p className="mt-3 text-sm text-[#8DA79A] leading-relaxed">
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
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-[#0FA968] py-4 text-sm font-bold text-white transition-colors hover:bg-[#0B7A4B] active:scale-[0.97]"
            >
              {isBlocked ? "Enable Camera" : "Try Again"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full border border-[#223029] bg-[#141B18] py-3 text-xs font-bold uppercase tracking-[0.18em] text-[#E9F0EC] transition-colors hover:bg-[#E9F0EC] hover:text-black rounded-[var(--radius-card)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Regular Camera QR scanner view */
        <div className="flex h-full flex-col items-center justify-center px-6 text-[#E9F0EC] w-full">
          <div className="mb-6 text-center">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#8DA79A] font-bold">
              {tenantName}
            </p>
            <h2 className="mt-1 text-2xl font-normal text-[#E9F0EC] font-display">Scan Counter QR</h2>
          </div>

          {/* Viewport Frame */}
          <div className="relative aspect-square w-full max-w-[300px] overflow-hidden border border-[#223029] bg-[#141B18] rounded-[var(--radius-card)]">
            <div
              id="qr-reader-viewport"
              className="absolute inset-0 h-full w-full overflow-hidden [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
            />

            <div className="pointer-events-none absolute inset-6 overflow-hidden z-10">
              <div
                className="absolute left-0 right-0 h-[2px] bg-[#34D399]"
                style={{ animation: "scan-line 2.2s ease-in-out infinite" }}
              />
            </div>

            <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-25">
              <QrCode className="h-12 w-12 text-[#E9F0EC]" strokeWidth={1.2} />
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-[#8DA79A]">
              <ScanLine className="h-4 w-4 text-[#E9F0EC]" />
              <span>Align the counter's QR inside the frame</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-10 border border-[#223029] bg-[#141B18] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#E9F0EC] transition-colors hover:bg-[#E9F0EC] hover:text-black rounded-[var(--radius-card)]"
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
