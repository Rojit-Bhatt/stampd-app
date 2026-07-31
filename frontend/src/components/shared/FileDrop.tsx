import { useCallback, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { UploadCloud, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useMotion } from "../../lib/motion";
import { uploadImage, type ImageOwnerType } from "../../lib/images";

type Status = "idle" | "dragging" | "working" | "error";

interface FileDropProps {
  mode: "image" | "file";
  ownerType?: ImageOwnerType;
  accept?: string;
  maxBytes?: number;
  previewUrl?: string | null;
  onImageUploaded?: (result: { id: string; url: string }) => void;
  onFilePicked?: (file: File) => void;
  onRemove?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 KB";
  const units = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export function FileDrop({
  mode,
  ownerType,
  accept,
  maxBytes = 512 * 1024,
  previewUrl,
  onImageUploaded,
  onFilePicked,
  onRemove,
  label = "Click to choose, or drag a file here",
  disabled,
  className,
}: FileDropProps) {
  const m = useMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handle = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);

      if (mode === "file") {
        // Raw passthrough — the xlsx import must stay a real multipart upload
        // to its own preview/confirm endpoints, not the image pipeline.
        if (file.size > maxBytes) {
          setStatus("error");
          setError(`That file is over ${formatBytes(maxBytes)}.`);
          return;
        }
        setStatus("idle");
        onFilePicked?.(file);
        return;
      }

      if (!ownerType) throw new Error("FileDrop in image mode needs an ownerType.");
      setStatus("working");
      try {
        // Size is checked AFTER resizing, not before: a 4MB phone photo is a
        // perfectly normal input that resizes down to well under the ceiling.
        const result = await uploadImage(file, ownerType);
        setStatus("idle");
        onImageUploaded?.(result);
      } catch (err) {
        setStatus("error");
        setError((err as Error).message || "Couldn't upload that image — try again.");
      }
    },
    [mode, ownerType, maxBytes, onFilePicked, onImageUploaded],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setStatus("idle");
    const file = e.dataTransfer.files?.[0];
    if (file && !disabled) void handle(file);
  };

  const defaultAccept = mode === "image" ? "image/png,image/jpeg,image/webp" : ".xlsx";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setStatus("dragging"); }}
        onDragLeave={() => setStatus((s) => (s === "dragging" ? "idle" : s))}
        onDrop={onDrop}
        className={cn(
          "relative flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed px-4 py-5 text-center transition-colors",
          status === "dragging"
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--primary)]",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <AnimatePresence mode="wait">
          {previewUrl ? (
            <motion.div
              key="preview"
              initial={m.pick({ opacity: 0, scale: 0.96 }, false)}
              animate={{ opacity: 1, scale: 1 }}
              exit={m.pick({ opacity: 0, scale: 0.96 }, { opacity: 0 })}
              transition={m.spring("cardEnter")}
              className="flex flex-col items-center gap-2"
            >
              <img
                src={previewUrl}
                alt=""
                className="max-h-[92px] rounded-[var(--radius-field)] object-cover"
              />
              <span className="text-[11px] text-[var(--muted)]">Click to replace</span>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={m.pick({ opacity: 0, y: 6 }, false)}
              animate={{ opacity: 1, y: 0 }}
              exit={m.pick({ opacity: 0, y: -6 }, { opacity: 0 })}
              transition={m.ease("ui")}
              className="flex flex-col items-center gap-2"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--primary-deep)]">
                <UploadCloud className="h-5 w-5" />
              </span>
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {status === "working" ? "Uploading…" : label}
              </span>
              {fileName && status !== "error" && (
                <span className="text-[11px] text-[var(--soft)]">{fileName}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {previewUrl && onRemove && (
          <button
            type="button"
            aria-label="Remove image"
            onClick={(e) => { e.stopPropagation(); onRemove(); setFileName(null); }}
            className="absolute right-2 top-2 rounded-full bg-[var(--surface)] p-1.5 text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept || defaultAccept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
          // Reset so picking the same file twice still fires a change.
          e.target.value = "";
        }}
      />

      {error && <p className="text-[12px] text-[var(--err)]">{error}</p>}
    </div>
  );
}
