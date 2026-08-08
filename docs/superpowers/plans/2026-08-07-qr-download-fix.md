# QR Download Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Download QR only" button on the platform's `/review-qr` flyer generator produce a PNG with a white background and a centered Stampd logo, instead of the current deliberately-transparent QR-only download.

**Architecture:** `ReviewFlyer.tsx`'s off-screen `QRCodeCanvas` (transparent) stays as-is — it's also the source the full flyer composite already uses. The "Download QR only" button's click handler changes to composite a NEW canvas (white background + the QR + the centered logo image) before downloading, instead of downloading the raw transparent QR canvas directly.

**Tech Stack:** React 19 + TS, `qrcode.react`, plain Canvas 2D API (already used in this file for the flyer composite).

## Global Constraints
- No new npm dependencies — use the existing `public/pwa-512x512.png` coin-logo asset and plain Canvas 2D, matching this file's existing style.
- Keep the logo small enough to sit inside the QR's error-correction budget (`level="M"` ≈ 15% recoverable) — logo no larger than ~18% of the QR's width, centered.
- No frontend test framework exists in this repo — verification is `npx tsc --noEmit` plus a manual browser check (download the file, open it, and scan it with a phone camera if possible; at minimum confirm visually that it has a white background and a centered logo, and that the QR modules around the logo are still dense/intact).

---

### Task 1: White-background QR-only download with centered logo

**Files:**
- Modify: `frontend/src/routes/platform/reviewqr/ReviewFlyer.tsx`

**Interfaces:**
- Consumes: nothing from other tasks — standalone plan.
- Produces: nothing consumed elsewhere.

**Context:** The "Download QR only" button currently calls `download(qr, ...)` directly on the off-screen `QRCodeCanvas`, which is deliberately transparent (`bgColor="rgba(0,0,0,0)"`) — the UI even warns "Place it on a light background." The fix composites a new canvas with a white background and the existing `public/pwa-512x512.png` logo centered on top, before downloading.

- [x] **Step 1: Add a logo-loading helper and a QR-only composite function**

Open `frontend/src/routes/platform/reviewqr/ReviewFlyer.tsx`. Find the existing `download` helper:

```typescript
function download(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
```

Add two new functions directly after it:

```typescript
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// White background + the QR + a centered logo, replacing the raw transparent
// QR canvas for the standalone download. Margin matches QR_PANEL's own
// padding (60px) so the white square reads as a deliberate card, not a crop.
// The logo is sized to ~18% of the QR's width — comfortably inside the ~15%
// error-correction budget `level="M"` gives, so it doesn't break scanning.
async function buildQrOnlyCanvas(qrCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const margin = 60;
  const size = QR_PX + margin * 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not build the QR canvas.");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(qrCanvas, margin, margin, QR_PX, QR_PX);

  const logo = await loadImage("/pwa-512x512.png");
  const logoSize = QR_PX * 0.18;
  const logoX = (size - logoSize) / 2;
  const logoY = (size - logoSize) / 2;
  ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

  return canvas;
}
```

- [x] **Step 2: Update the "Download QR only" button to use the composite**

Find:

```typescript
        <button
          type="button"
          onClick={() => {
            const qr = qrWrapRef.current?.querySelector("canvas");
            if (qr) download(qr, `${slug}-review-qr.png`);
          }}
          className="rounded-[74px] border border-[var(--lp-line)] px-5 py-3 text-sm text-[var(--lp-ink)] transition-colors hover:border-[var(--lp-green)]"
        >
          Download QR only
        </button>

        <p className="text-sm leading-relaxed text-[var(--lp-muted)]">
          The QR-only file has a transparent background. Place it on a light
          background — a dark code on a dark surface will not scan.
        </p>
```

Replace with:

```typescript
        <button
          type="button"
          onClick={async () => {
            const qr = qrWrapRef.current?.querySelector("canvas");
            if (!qr) return;
            const composite = await buildQrOnlyCanvas(qr);
            download(composite, `${slug}-review-qr.png`);
          }}
          className="rounded-[74px] border border-[var(--lp-line)] px-5 py-3 text-sm text-[var(--lp-ink)] transition-colors hover:border-[var(--lp-green)]"
        >
          Download QR only
        </button>

        <p className="text-sm leading-relaxed text-[var(--lp-muted)]">
          A print-ready square with a white background and the Stampd mark —
          stick it up as-is.
        </p>
```

- [x] **Step 3: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 4: Manually verify in a browser**

Start this worktree's own dev servers directly (not a shared preview tool that may be bound to a different checkout):

```bash
cd backend && MONGODB_URI= PORT=5001 npm run dev > /tmp/wt-backend.log 2>&1 &
cd frontend && npx vite --port 3010 > /tmp/wt-frontend.log 2>&1 &
```

Open `http://localhost:3010/review-qr`, search for and select any business (this page uses a live Google Places search — pick whatever result comes back), click "Download QR only". Expected: a PNG downloads with a white background, the QR code, and the Stampd coin logo centered on top. Confirm visually via screenshot or by opening the downloaded file. Stop both background servers when done.

- [x] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/reviewqr/ReviewFlyer.tsx
git commit -m "$(cat <<'EOF'
fix: QR-only download gets a white background and centered logo

The standalone "Download QR only" button previously shipped the raw,
deliberately transparent QR canvas (built for layering onto the
flyer), with UI copy warning the user to place it on a light
background themselves. Now composites a white background and the
Stampd coin logo (public/pwa-512x512.png) onto the QR before download —
a self-contained, print-ready file. Logo sized to ~18% of the QR's
width, comfortably inside level="M"'s ~15% error-correction budget.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** the one spec item (white bg + centered logo on QR-only download) is fully covered by Task 1.
- **Type consistency:** `buildQrOnlyCanvas` returns `Promise<HTMLCanvasElement>`, matching `download`'s existing `HTMLCanvasElement` parameter — no signature mismatch.
- **No placeholders:** every step has literal code.
