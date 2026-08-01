import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

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

function safeFilename(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business";
}

export function ReviewFlyer({ place }: { place: SelectedPlace }) {
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const flyerRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const compose = async () => {
      // The display fonts are web fonts; drawing before they load silently
      // falls back to a system face and the flyer ships in the wrong type.
      await document.fonts.ready;
      if (cancelled) return;

      const qrCanvas = qrWrapRef.current?.querySelector("canvas");
      const canvas = flyerRef.current;
      if (!qrCanvas || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

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

      ctx.fillStyle = "rgba(243, 236, 226, 0.62)";
      ctx.font = "400 30px Inter, sans-serif";
      ctx.fillText("It takes ten seconds. Thank you.", W / 2, panelY + QR_PANEL + 152);

      ctx.fillStyle = "rgba(243, 236, 226, 0.42)";
      ctx.font = "500 24px 'IBM Plex Mono', monospace";
      ctx.fillText("Made free with Stampd · stampd.co", W / 2, H - 110);

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
      {/* The QR is rendered off-screen at full size purely as a source for
          drawImage. bgColor is transparent so the "QR only" download drops
          onto any light artwork; the flyer supplies its own cream panel. */}
      <div ref={qrWrapRef} className="sr-only" aria-hidden="true">
        <QRCodeCanvas
          value={place.reviewUrl}
          size={QR_PX}
          bgColor="rgba(0,0,0,0)"
          fgColor="#14201C"
          level="M"
          marginSize={2}
        />
      </div>

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
      </div>
    </div>
  );
}
