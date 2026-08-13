import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import type { SelectedPlace } from "./PlaceSearch";

// 1080x1350: prints cleanly at A5 and posts as-is to Instagram, which is where
// a Nepali shop is most likely to put it.
const W = 1080;
const H = 1350;

// The QR panel is cream even though the flyer is dark. Dark-on-light is a scan
// requirement, not a style choice — an inverted code fails on a meaningful
// share of phone cameras, so this one element does not inherit the page's
// colour scheme.
const QR_PX = 560;
const QR_PANEL = 680;

const INK = "#F3ECE2";
const BG = "#14201C";
const PANEL = "#1D2F28";
const CREAM = "#F3ECE2";
const GREEN = "#0FA968";

// Dark ink for the QR modules — the reference QR is black-on-white, and the
// flyer panel is the same cream, so one palette covers both outputs.
const QR_INK = "#14201C";

// Stampd mark colours, matching `StampdLogo`.
const MARK_DARK = "#1F1B18";

// Draws the circular Stampd tile (cream disc + coin mark) to match the
// reference QR: a solid cream circle holding the two-coin mark, centred.
// `cx, cy` is the circle's centre and `r` its radius.
//
// Proportions were measured from the reference image:
//   - tile diameter ≈ 84% of the QR width → radius ≈ 0.42 × QR width
//   - each coin's diameter ≈ 55% of the tile's diameter
//   - coins overlap: front coin centred down-right at ≈ 0.18 × coin diameter
//   - back coin is an outlined ring (no fill), front coin is filled dark with
//     a cream four-point star, exactly like `StampdLogo`.
function drawStampdCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // The filled cream disc, matching the QR panel colour so it reads as one
  // intentional tile cut out of the code, not a sticker.
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  // The two-coin mark, sized so it fills the tile like the reference (not the
  // tiny floating mark from before).
  const coinR = r * 0.275;
  const shift = coinR * 0.36;
  const backX = cx - shift, backY = cy - shift;
  const frontX = cx + shift, frontY = cy + shift;

  // Back coin: outlined ring only — it sits behind the front coin and reads
  // as the coin the front one overlaps.
  ctx.strokeStyle = MARK_DARK;
  ctx.lineWidth = coinR * 0.13;
  ctx.beginPath();
  ctx.arc(backX, backY, coinR, 0, Math.PI * 2);
  ctx.stroke();

  // Front coin: filled dark disc — drawn second so it occludes the back ring.
  ctx.fillStyle = MARK_DARK;
  ctx.beginPath();
  ctx.arc(frontX, frontY, coinR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  // Cream four-point star on the front coin, same geometry as `StampdLogo`.
  const starR = coinR * 0.42;
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    const tipX = frontX + Math.cos(a) * starR;
    const tipY = frontY + Math.sin(a) * starR;
    const aMid = a + Math.PI / 4;
    const innerX = frontX + Math.cos(aMid) * starR * 0.34;
    const innerY = frontY + Math.sin(aMid) * starR * 0.34;
    if (i === 0) ctx.moveTo(tipX, tipY);
    else ctx.lineTo(tipX, tipY);
    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStars(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number) {
  const gap = size * 1.5;
  const startX = cx - gap * 2;
  ctx.fillStyle = GREEN;
  for (let i = 0; i < 5; i++) {
    const x = startX + i * gap;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const radius = p % 2 === 0 ? size / 2 : size / 4.6;
      const angle = (Math.PI / 5) * p - Math.PI / 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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

// One source of truth for the branded QR: qrcode renders the modules into a
// fresh canvas, then the circular Stampd tile is burned into its centre —
// exactly like the reference image. `level="M"` keeps the logo inside the
// error-correction budget; `marginSize` leaves the finder patterns untouched.
//
// Rendering it fresh each time (instead of hiding a React-rendered QR canvas)
// means the flyer and the QR-only download share one function and the logo is
// never out of sync between outputs.
async function buildQrCanvas(value: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  // `toCanvas` is the browser API: it paints the full code into the provided
  // canvas at the requested `width`, with the `margin` module count.
  await QRCode.toCanvas(canvas, value, {
    color: { dark: QR_INK, light: "#FFFFFF" },
    // Level H (~30% of the code can be damaged) is needed now: the circular
    // Stampd tile covers roughly a 42% width area of the code, which exceeds
    // what M (~15%) can recover. H also makes the printed flyer more robust
    // against smudges and low-contrast lighting.
    errorCorrectionLevel: "H",
    margin: 2,
    width: QR_PX,
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not build the QR canvas.");
  // Burn the circular Stampd tile into the centre of the code — this is what
  // makes the QR look like the reference image on every output. The flyer's
  // cream panel sits behind it, and the QR-only download carries its own white
  // surround, so the same tile works for both. Diameter ≈ 84% of QR width per
  // the measured reference proportions; the M error-correction budget covers it.
  drawStampdCircle(ctx, QR_PX / 2, QR_PX / 2, QR_PX * 0.21);
  return canvas;
}

// White background + the branded QR, for the standalone download. Margin
// matches QR_PANEL's own padding (60px) so the white square reads as a
// deliberate card, not a crop.
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

  return canvas;
}

function safeFilename(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business";
}

export function ReviewFlyer({ place }: { place: SelectedPlace }) {
  const flyerRef = useRef<HTMLCanvasElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const compose = async () => {
      // The display fonts are web fonts; drawing before they load silently
      // falls back to a system face and the flyer ships in the wrong type.
      await document.fonts.ready;
      if (cancelled) return;

      const canvas = flyerRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // The branded QR is the shared asset for both outputs — build it once
      // and reuse it for the flyer and the QR-only download.
      const qrCanvas = await buildQrCanvas(place.reviewUrl);
      qrCanvasRef.current = qrCanvas;
      if (cancelled) return;

      canvas.width = W;
      canvas.height = H;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // Panel behind everything, so the flyer reads as one card when printed
      // and trimmed slightly off-centre.
      ctx.fillStyle = PANEL;
      roundedRect(ctx, 48, 48, W - 96, H - 96, 56);
      ctx.fill();

      ctx.textAlign = "center";

      ctx.fillStyle = GREEN;
      ctx.font = "500 26px 'IBM Plex Mono', monospace";
      ctx.fillText("REVIEW US ON GOOGLE", W / 2, 190);

      ctx.fillStyle = INK;
      ctx.font = "400 76px 'Space Grotesk', sans-serif";
      ctx.fillText(place.name, W / 2, 290);

      drawStars(ctx, W / 2, 360, 46);

      // Cream QR panel — see the note at the top of this file.
      const panelX = (W - QR_PANEL) / 2;
      const panelY = 430;
      ctx.fillStyle = CREAM;
      roundedRect(ctx, panelX, panelY, QR_PANEL, QR_PANEL, 44);
      ctx.fill();

      ctx.drawImage(
        qrCanvas,
        panelX + (QR_PANEL - QR_PX) / 2,
        panelY + (QR_PANEL - QR_PX) / 2,
        QR_PX,
        QR_PX,
      );

      ctx.fillStyle = INK;
      ctx.font = "400 46px 'Space Grotesk', sans-serif";
      ctx.fillText("Scan with your camera", W / 2, panelY + QR_PANEL + 100);

      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      }, "image/png");
    };

    void compose();
    return () => { cancelled = true; };
  }, [place]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const slug = safeFilename(place.name);

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <canvas ref={flyerRef} className="hidden" />

      <div className="rounded-3xl border border-[var(--lp-line)] p-4">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Review flyer for ${place.name}`}
            className="mx-auto w-full max-w-sm rounded-2xl"
          />
        ) : (
          <p className="p-8 text-center text-sm text-[var(--lp-muted)]">
            Building your flyer…
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 self-start">
        <button
          type="button"
          onClick={() => flyerRef.current && download(flyerRef.current, `${slug}-review-flyer.png`)}
          className="rounded-[74px] bg-[var(--lp-cream)] px-5 py-3 text-sm font-medium text-[#14201C] transition-transform duration-200 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          Download flyer
        </button>

        <button
          type="button"
          onClick={async () => {
            const qr = qrCanvasRef.current ?? await buildQrCanvas(place.reviewUrl).catch(() => null);
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
      </div>
    </div>
  );
}
