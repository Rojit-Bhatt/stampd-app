// Standalone verification: re-implements the flyer render pipeline from
// ReviewFlyer.tsx in Node (canvas + qrcode) so we can screenshot-check the
// flyer, the branded QR, and the QR-only download without a browser.
import QRCode from "qrcode";
import { createCanvas } from "canvas";
import { createWriteStream } from "node:fs";

const W = 1080, H = 1350;
const QR_PX = 560, QR_PANEL = 680;
const INK = "#F3ECE2", BG = "#14201C", PANEL = "#1D2F28", CREAM = "#F3ECE2", GREEN = "#0FA968";
const QR_INK = "#14201C", MARK_DARK = "#1F1B18";

function drawStampdCircle(ctx, cx, cy, r) {
  ctx.fillStyle = CREAM;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.fill();
  const coinR = r * 0.275;
  const shift = coinR * 0.36;
  const backX = cx - shift, backY = cy - shift;
  const frontX = cx + shift, frontY = cy + shift;
  ctx.strokeStyle = MARK_DARK; ctx.lineWidth = coinR * 0.13;
  ctx.beginPath(); ctx.arc(backX, backY, coinR, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = MARK_DARK;
  ctx.beginPath(); ctx.arc(frontX, frontY, coinR, 0, Math.PI * 2); ctx.closePath(); ctx.fill();
  const starR = coinR * 0.42;
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    const tipX = frontX + Math.cos(a) * starR, tipY = frontY + Math.sin(a) * starR;
    const aMid = a + Math.PI / 4;
    const innerX = frontX + Math.cos(aMid) * starR * 0.34, innerY = frontY + Math.sin(aMid) * starR * 0.34;
    if (i === 0) ctx.moveTo(tipX, tipY); else ctx.lineTo(tipX, tipY);
    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath(); ctx.fill();
}

function drawStars(ctx, cx, y, size) {
  const gap = size * 1.5, startX = cx - gap * 2;
  ctx.fillStyle = GREEN;
  for (let i = 0; i < 5; i++) {
    const x = startX + i * gap;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const radius = p % 2 === 0 ? size / 2 : size / 4.6;
      const angle = (Math.PI / 5) * p - Math.PI / 2;
      const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const url = "https://example.com/place/review";

async function buildQrCanvas(value) {
  const c = createCanvas(QR_PX, QR_PX);
  await QRCode.toCanvas(c, value, { color: { dark: QR_INK, light: "#FFFFFF" }, errorCorrectionLevel: "H", margin: 2, width: QR_PX });
  drawStampdCircle(c.getContext("2d"), QR_PX / 2, QR_PX / 2, QR_PX * 0.21);
  return c;
}

const qr = await buildQrCanvas(url);
qr.createPNGStream().pipe(createWriteStream("/home/ubuntu/stampd-app/verify/branded-qr.png"));

// Flyer
const flyer = createCanvas(W, H);
const fctx = flyer.getContext("2d");
fctx.fillStyle = BG; fctx.fillRect(0, 0, W, H);
fctx.fillStyle = PANEL;
roundedRect(fctx, 48, 48, W - 96, H - 96, 56); fctx.fill();
fctx.textAlign = "center";
fctx.fillStyle = GREEN; fctx.font = "500 26px monospace";
fctx.fillText("REVIEW US ON GOOGLE", W / 2, 190);
fctx.fillStyle = INK; fctx.font = "400 76px sans-serif";
fctx.fillText("Magic Cups", W / 2, 290);
drawStars(fctx, W / 2, 360, 46);
const panelX = (W - QR_PANEL) / 2, panelY = 430;
fctx.fillStyle = CREAM;
roundedRect(fctx, panelX, panelY, QR_PANEL, QR_PANEL, 44); fctx.fill();
fctx.drawImage(qr, panelX + (QR_PANEL - QR_PX) / 2, panelY + (QR_PANEL - QR_PX) / 2, QR_PX, QR_PX);
fctx.fillStyle = INK; fctx.font = "400 46px sans-serif";
fctx.fillText("Scan with your camera", W / 2, panelY + QR_PANEL + 100);
flyer.createPNGStream().pipe(createWriteStream("/home/ubuntu/stampd-app/verify/flyer-preview.png"));

// QR only
const margin = 60, size = QR_PX + margin * 2;
const only = createCanvas(size, size);
const octx = only.getContext("2d");
octx.fillStyle = "#FFFFFF"; octx.fillRect(0, 0, size, size);
octx.drawImage(qr, margin, margin, QR_PX, QR_PX);
only.createPNGStream().pipe(createWriteStream("/home/ubuntu/stampd-app/verify/qr-only.png"));
console.log("all assets written");
