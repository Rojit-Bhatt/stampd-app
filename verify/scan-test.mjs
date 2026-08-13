// Scannability probe: render the QR at each error-correction level with the
// logo tile burned in, then check whether it decodes at full size and at a
// simulated 350px phone-scan size.
import QRCode from "qrcode";
import { createCanvas } from "canvas";
import { writeFileSync } from "node:fs";

const QR_PX = 560;
const CREAM = "#F3ECE2", MARK_DARK = "#1F1B18";

function drawStampdCircle(ctx, cx, cy, r) {
  ctx.fillStyle = CREAM;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.fill();
  const coinR = r * 0.275, shift = coinR * 0.36;
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

const url = "https://example.com/place/review";
for (const lvl of ["L", "M", "Q", "H"]) {
  const c = createCanvas(QR_PX, QR_PX);
  await QRCode.toCanvas(c, url, { errorCorrectionLevel: lvl, margin: 2, width: QR_PX });
  drawStampdCircle(c.getContext("2d"), QR_PX / 2, QR_PX / 2, QR_PX * 0.21);
  writeFileSync(`/home/ubuntu/stampd-app/verify/scan-${lvl}.png`, c.toBuffer("image/png"));
  console.log(lvl, "written");
}
