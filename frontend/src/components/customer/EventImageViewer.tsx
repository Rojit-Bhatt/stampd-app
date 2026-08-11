import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMotion } from "../../lib/motion";

interface EventImageViewerProps {
  imageUrl: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

// Single-tap zoom rather than true pinch: the app has no gesture library on
// board, and a tap toggling 1x/2.2x scale (panned via native scroll on the
// zoomed container) reads a printed poster's fine print well enough on a
// phone without pulling one in.
export function EventImageViewer({ imageUrl, alt, open, onClose }: EventImageViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("center");
  const m = useMotion();

  const handleClose = () => {
    setZoomed(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} — full size`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={m.ease("ui")}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
          onClick={() => !zoomed && handleClose()}
        >
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center rounded-[var(--radius-btn)] border border-[#3A3A3C] bg-[#1C1C1E] text-white transition-colors hover:bg-white hover:text-black"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
          <div className="h-full w-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageUrl}
              alt={alt}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                setOrigin(`${x}% ${y}%`);
                setZoomed((z) => !z);
              }}
              style={{ transformOrigin: origin }}
              className={`mx-auto min-h-full cursor-zoom-in object-contain transition-transform duration-200 ${
                zoomed ? "scale-[2.2] cursor-zoom-out" : "scale-100"
              }`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
