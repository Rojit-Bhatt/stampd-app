import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cropToAvatarBlob } from "../../lib/avatar";

const FRAME_SIZE = 240;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface AvatarCropDialogProps {
  file: File | null;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}

/**
 * Manual avatar crop: drag to pan, pinch (or mouse-wheel/ctrl+scroll on
 * desktop) to zoom, over a circular mask. Pan/zoom state lives in CSS-px
 * "frame" coordinates (top-left of the displayed image relative to the
 * frame), which doubles as exactly the input cropToAvatarBlob needs — no
 * separate conversion step at save time.
 */
export function AvatarCropDialog({ file, onCancel, onSave }: AvatarCropDialogProps) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  // Active pointers by id, for telling a one-finger drag (pan) apart from a
  // two-finger pinch (zoom) — a single dragState isn't enough once a second
  // finger can land mid-gesture.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinchState = useRef<{ startDist: number; startZoom: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setBitmap(null);
      setFileUrl(null);
      return;
    }
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    createImageBitmap(file).then((bmp) => {
      if (cancelled) return;
      // Cover-scale: the smallest scale at which the image fully fills the
      // square frame with no gaps, same idea as CSS object-fit: cover.
      const cover = Math.max(FRAME_SIZE / bmp.width, FRAME_SIZE / bmp.height);
      setBaseScale(cover);
      setZoom(1);
      setOffset({ x: (FRAME_SIZE - bmp.width * cover) / 2, y: (FRAME_SIZE - bmp.height * cover) / 2 });
      setBitmap(bmp);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => () => bitmap?.close(), [bitmap]);

  if (!file || !bitmap || !fileUrl) return null;

  const displayScale = baseScale * zoom;
  const displayWidth = bitmap.width * displayScale;
  const displayHeight = bitmap.height * displayScale;

  const clampOffset = (x: number, y: number, width: number, height: number) => ({
    x: Math.min(0, Math.max(FRAME_SIZE - width, x)),
    y: Math.min(0, Math.max(FRAME_SIZE - height, y)),
  });

  const applyZoom = (next: number) => {
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    setZoom(clamped);
    const nextScale = baseScale * clamped;
    const nextWidth = bitmap.width * nextScale;
    const nextHeight = bitmap.height * nextScale;
    // Re-clamps to the new bounds only — doesn't try to keep the same
    // content centred under the frame while zooming, which would need
    // tracking a focal point. Simpler, and the user can re-drag or
    // re-pinch after zooming if the framing drifted.
    setOffset((prev) => clampOffset(prev.x, prev.y, nextWidth, nextHeight));
  };

  const pinchDistance = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return null;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Capture is best-effort: if it throws (invalid pointer id, unsupported
    // pointer type), the drag/pinch tracking below — which is driven by our
    // own pointers ref, not by capture — must still proceed.
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignored — see above
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      dragState.current = null;
      const dist = pinchDistance();
      if (dist) pinchState.current = { startDist: dist, startZoom: zoom };
    } else if (pointers.current.size === 1) {
      dragState.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchState.current) {
      const dist = pinchDistance();
      if (dist) applyZoom(pinchState.current.startZoom * (dist / pinchState.current.startDist));
      return;
    }

    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clampOffset(dragState.current.originX + dx, dragState.current.originY + dy, displayWidth, displayHeight));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchState.current = null;
    if (pointers.current.size === 0) dragState.current = null;
  };

  // Desktop fallback: a trackpad pinch reaches the browser as a wheel event
  // with ctrlKey set; a plain mouse wheel zooms too, since there's no pinch
  // gesture available at all on that input.
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    applyZoom(zoom - e.deltaY * 0.01);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const blob = await cropToAvatarBlob(bitmap, {
        frameSize: FRAME_SIZE,
        scale: displayScale,
        offsetX: offset.x,
        offsetY: offset.y,
      });
      onSave(blob);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[320px] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-[var(--ink)]">Reposition photo</DialogTitle>
        </DialogHeader>

        <div
          className="relative mx-auto touch-none overflow-hidden rounded-[var(--radius-card)] bg-black"
          style={{ width: FRAME_SIZE, height: FRAME_SIZE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
        >
          <img
            src={fileUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute select-none"
            style={{ width: displayWidth, height: displayHeight, left: offset.x, top: offset.y }}
          />
          {/* Circular mask via box-shadow rather than clip-path, so it
              composites as a dark vignette on top of the image instead of
              cutting a hole through this div itself. */}
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
        </div>

        <p className="mt-3 text-center text-[13px] text-[var(--muted)]">Drag to reposition, pinch to zoom.</p>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
