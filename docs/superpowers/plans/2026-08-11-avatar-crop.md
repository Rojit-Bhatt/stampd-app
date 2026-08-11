# Avatar Tap-to-Change + Manual Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Change"/"Add a picture" button and silent auto-centre-crop in `AvatarPicker` with tap-the-avatar-to-open-an-action-sheet (Choose photo / Remove) and a manual crop step (drag-to-pan, slider-to-zoom, circular mask) before upload.

**Architecture:** New `AvatarCropDialog` component owns the crop interaction (pan via pointer events, zoom via a range input, both clamped so the image always fully covers the circular frame) and produces a cropped WebP `Blob` via a new `cropToAvatarBlob` helper in `frontend/src/lib/avatar.ts`, replacing that file's `resizeToAvatar` (auto-centre-crop, no user control). `AvatarPicker` gains a `Sheet`-based action sheet (existing `frontend/src/components/ui/sheet.tsx` primitive) triggered by tapping the avatar image itself, and wires "Choose photo" → native file input → `AvatarCropDialog` → the existing upload call, unchanged past that point.

**Tech Stack:** React, TypeScript, Tailwind, Canvas 2D, Pointer Events API — no new dependencies. Reuses the existing shadcn `Sheet` and `Dialog` primitives already in the repo.

## Global Constraints

- No new npm dependencies.
- The upload contract to the backend is unchanged: a `Blob` appended to `FormData` under `file`, `POST /api/customer-auth/avatar` — this plan only changes how that `Blob` is produced client-side. No backend changes.
- `AVATAR_SIZE` (256) and `AVATAR_QUALITY` (0.82) constants in `frontend/src/lib/avatar.ts` are unchanged — the crop still outputs the same size/quality WebP `resizeToAvatar` used to.
- No frontend unit test runner; verification = `tsc --noEmit` + manual browser check (pointer drag and pinch/wheel-zoom interactions can't be meaningfully scripted without a real device/trackpad, so this is manual-only, screenshot-verified).
- `resizeToAvatar` is deleted, not deprecated-in-place — it has exactly one caller (`AvatarPicker.tsx:54`) and that caller is rewritten in this same plan, so there is no transition period where both need to exist.

---

### Task 1: Replace `resizeToAvatar` with `cropToAvatarBlob`

**Files:**
- Modify: `frontend/src/lib/avatar.ts:23-64` (remove `resizeToAvatar`, add `cropToAvatarBlob`)

**Interfaces:**
- Produces: `cropToAvatarBlob(bitmap: ImageBitmap, frame: { frameSize: number; scale: number; offsetX: number; offsetY: number }): Promise<Blob>` — consumed by `AvatarCropDialog` (Task 2). `scale` is the total displayed-px-per-source-px multiplier (base cover-scale × user zoom); `offsetX`/`offsetY` are the displayed image's top-left corner relative to the frame's top-left corner, in CSS px — i.e. exactly the values a caller would already be tracking to render the live preview, so no extra math is needed to call this.

- [ ] **Step 1: Replace the function**

Replace lines 23–64 of `frontend/src/lib/avatar.ts` (the `resizeToAvatar` function and its docstring) with:

```ts
/**
 * Renders a user-positioned crop of a picked image to a small square WebP,
 * in the browser, before it is ever uploaded.
 *
 * Same storage story as before (see AVATAR_SIZE/AVATAR_QUALITY above): the
 * server has no image pipeline, so what lands in the database is exactly
 * these bytes. The difference from the old auto-centre-crop is only WHERE
 * the square comes from — here it's whatever the user framed in
 * AvatarCropDialog's circular preview, converted from that dialog's CSS-px
 * frame coordinates back to the source bitmap's pixel coordinates.
 *
 * `frame.scale` is displayed-px per source-px (the dialog's cover-scale ×
 * its zoom slider); `frame.offsetX/Y` is the displayed image's top-left
 * corner relative to the frame's top-left corner. Both are values the
 * dialog already tracks to draw the live preview, so this function is pure
 * math with no DOM reads of its own.
 */
export async function cropToAvatarBlob(
  bitmap: ImageBitmap,
  frame: { frameSize: number; scale: number; offsetX: number; offsetY: number },
): Promise<Blob> {
  const sourceScale = 1 / frame.scale;
  const sx = -frame.offsetX * sourceScale;
  const sy = -frame.offsetY * sourceScale;
  const sSize = frame.frameSize * sourceScale;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.drawImage(bitmap, sx, sy, sSize, sSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", AVATAR_QUALITY);
  });
  if (!blob) throw new Error("Could not process that image.");
  return blob;
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run lint`
Expected: an error at `AvatarPicker.tsx:7,54` (still importing/calling the now-deleted `resizeToAvatar`) — this is expected and fixed in Task 3. Confirm the error is only in that one file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/avatar.ts
git commit -m "feat(avatar): replace auto-centre-crop with cropToAvatarBlob for manual positioning"
```

(Committing here despite the known `AvatarPicker.tsx` type error is fine — Task 3 fixes it in the same feature branch before this plan is considered done; `lint` is re-run clean at the end of Task 3.)

---

### Task 2: Build `AvatarCropDialog`

**Files:**
- Create: `frontend/src/components/customer/AvatarCropDialog.tsx`

**Interfaces:**
- Produces: `AvatarCropDialog({ file, onCancel, onSave }: { file: File | null; onCancel: () => void; onSave: (blob: Blob) => void })` — renders nothing when `file` is `null`; opens a modal with drag-to-pan and slider-to-zoom over the picked image the instant a `file` is provided.
- Consumes: `cropToAvatarBlob` from Task 1; `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cropToAvatarBlob } from "../../lib/avatar";

const FRAME_SIZE = 240;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface AvatarCropDialogProps {
  file: File | null;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}

/**
 * Manual avatar crop: drag to pan, slider to zoom, over a circular mask.
 * Pan/zoom state lives in CSS-px "frame" coordinates (top-left of the
 * displayed image relative to the frame), which doubles as exactly the
 * input cropToAvatarBlob needs — no separate conversion step at save time.
 */
export function AvatarCropDialog({ file, onCancel, onSave }: AvatarCropDialogProps) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

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

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clampOffset(dragState.current.originX + dx, dragState.current.originY + dy, displayWidth, displayHeight));
  };

  const onPointerUp = () => {
    dragState.current = null;
  };

  const onZoomChange = (next: number) => {
    setZoom(next);
    const nextScale = baseScale * next;
    const nextWidth = bitmap.width * nextScale;
    const nextHeight = bitmap.height * nextScale;
    // Re-clamps to the new bounds only — doesn't try to keep the same
    // content centred under the frame while zooming, which would need
    // tracking a focal point. Simpler, and the user can re-drag after
    // zooming if the framing drifted.
    setOffset((prev) => clampOffset(prev.x, prev.y, nextWidth, nextHeight));
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
          onPointerUp={onPointerUp}
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

        <label className="mb-1.5 mt-4 block text-sm font-bold" htmlFor="avatar-zoom">
          Zoom
        </label>
        <input
          id="avatar-zoom"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-full"
        />

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
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run lint`
Expected: no new errors from this file (the pre-existing `AvatarPicker.tsx` error from Task 1 is still expected here — untouched until Task 3).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/customer/AvatarCropDialog.tsx
git commit -m "feat(avatar): add AvatarCropDialog with pan/zoom over a circular mask"
```

---

### Task 3: Wire `AvatarPicker` onto the action sheet + crop dialog

**Files:**
- Modify: `frontend/src/components/customer/AvatarPicker.tsx` (full rewrite — file is only 167 lines)

**Interfaces:**
- Consumes: `AvatarCropDialog` from Task 2; `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`.

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `frontend/src/components/customer/AvatarPicker.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import toast from "@/lib/toast";

import { useCustomerAuth, type GlobalAccount } from "../../context/CustomerAuthContext";
import { apiRequest } from "../../lib/api";
import { CustomerAvatar } from "./CustomerAvatar";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Profile-picture section of the customer's Profile page.
 *
 * The picture belongs to the global CustomerAccount, not to any one outlet's
 * membership — a customer has one face across every cafe — so this talks to
 * /api/customer-auth with the global session rather than to /api/account,
 * which is tenant-scoped.
 *
 * Tapping the avatar itself opens an action sheet (Choose photo / Remove),
 * rather than a separate "Change" button, so the tap target IS the thing
 * being changed. Picking a photo hands off to AvatarCropDialog for manual
 * positioning before upload — this component only owns the action sheet,
 * the upload call, and the optimistic preview.
 */
export function AvatarPicker({ className = "" }: { className?: string }) {
  const { globalAccount, setGlobalAccountData } = useCustomerAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // A local object URL of the cropped blob, shown the instant it exists. The
  // upload round-trip plus a fresh image fetch is otherwise a visible pause
  // on a phone connection, during which the old picture is still on screen.
  const [preview, setPreview] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const hasAvatar = Boolean(globalAccount?.avatarVersion);

  // Mirrors `preview` so the unmount cleanup can reach the CURRENT url — an
  // effect with an empty dep array closes over the initial null and would
  // revoke nothing. Without this, uploading and then navigating away pins the
  // blob for the lifetime of the page.
  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const setPreviewUrl = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  };

  const uploadBlob = async (blob: Blob) => {
    setBusy(true);
    try {
      setPreviewUrl(URL.createObjectURL(blob));
      const form = new FormData();
      form.append("file", blob, "avatar.webp");
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/avatar",
        { method: "POST", role: "customer-global", body: form },
      );
      setGlobalAccountData(res.account);
      toast.success("Profile picture updated!");
    } catch (err) {
      // Drop the optimistic preview — leaving it up would show a picture that
      // isn't actually saved anywhere.
      setPreviewUrl(null);
      toast.error((err as Error).message || "Couldn't save that picture — try another.");
    } finally {
      setBusy(false);
      // Lets the same file be picked again after a failure; without this the
      // input's value is unchanged and onChange never fires a second time.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setActionSheetOpen(false);
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/avatar",
        { method: "DELETE", role: "customer-global" },
      );
      setPreviewUrl(null);
      setGlobalAccountData(res.account);
      toast.success("Profile picture removed.");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't remove that — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-ambient ${className}`}
    >
      <div className="mb-3 text-sm font-bold">Profile picture</div>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => setActionSheetOpen(true)}
          disabled={busy}
          className="relative flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
        >
          {preview ? (
            <img src={preview} alt="" className="h-16 w-16 rounded-full bg-[var(--surface-2)] object-cover" />
          ) : (
            <CustomerAvatar
              accountId={globalAccount?.id}
              avatarVersion={globalAccount?.avatarVersion}
              name={globalAccount?.name}
              size={64}
            />
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[var(--primary)]">
            <Camera className="h-3 w-3 text-white" />
          </span>
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
              <Loader2 className="h-5 w-5 animate-spin text-white motion-reduce:animate-none" />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--muted)]">Tap your picture to change it.</p>
        </div>
      </div>

      <Sheet open={actionSheetOpen} onOpenChange={setActionSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-[var(--radius-card)]">
          <SheetHeader>
            <SheetTitle className="font-display text-lg font-bold text-[var(--ink)]">Profile picture</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                setActionSheetOpen(false);
                inputRef.current?.click();
              }}
            >
              <Camera className="h-4 w-4" />
              Choose photo
            </Button>
            {hasAvatar && (
              <Button type="button" variant="outline" onClick={onRemove}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AvatarCropDialog
        file={pendingFile}
        onCancel={() => {
          setPendingFile(null);
          if (inputRef.current) inputRef.current.value = "";
        }}
        onSave={(blob) => {
          setPendingFile(null);
          uploadBlob(blob);
        }}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors — the `resizeToAvatar` error from Task 1 is now resolved since this file no longer imports it.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/customer/AvatarPicker.tsx
git commit -m "feat(avatar): tap-to-open action sheet, hand off picked photo to AvatarCropDialog"
```

---

### Task 4: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Action sheet**

Start the dev server, navigate to customer Profile, tap the avatar. Verify: a bottom sheet opens with "Choose photo" (and "Remove" if an avatar is already set). Tapping outside or the sheet's own close affordance dismisses it without side effects.

- [ ] **Step 2: Crop dialog — pan and zoom**

Tap "Choose photo", pick an image. Verify: the crop dialog opens immediately showing the image covering the circular frame with no gaps. Dragging inside the frame pans the image; dragging past any edge stops at the edge (image never leaves a gap in the frame). Moving the zoom slider enlarges the image around its current position; at `zoom = 1` the image is back to its cover-fit size.

- [ ] **Step 3: Crop dialog — save and cancel**

Click "Save". Verify: the dialog closes, the avatar in the card immediately shows the cropped preview, and after the upload completes a success toast appears and the picture persists on reload. Repeat and click "Cancel" instead — verify no upload happens and the previous avatar (or initial) is still shown.

- [ ] **Step 4: Remove**

With an avatar set, open the action sheet and tap "Remove". Verify: avatar reverts to the initial-letter fallback and a success toast appears.

- [ ] **Step 5: Mobile viewport**

Resize to `375x812`, repeat Steps 1–3. Verify the crop dialog and its zoom slider are comfortably usable at this width (the `320px` max dialog width should fit with margin).
