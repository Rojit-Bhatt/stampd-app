# Implementation Plan: Flyer Updates (stampd-app)

## Context
The flyer is canvas-rendered client-side in `frontend/src/routes/platform/reviewqr/ReviewFlyer.tsx`.
The preview and the downloaded PNG come from the same canvas, so one code path fixes both.

## Requirements
1. Add the Stampd logo in the middle of the flyer (both preview and download).
2. Restyle the QR to match the reference: dark QR modules with the circular Stampd mark
   (cream tile with coin mark) centered in the middle of the QR.
3. Remove "Made free with Stampd . stampd.co" and "It takes ten seconds. Thank you." from
   preview and downloaded flyer.

## Implementation summary
- Replaced `qrcode.react` rendering with the `qrcode` library (`QRCode.toCanvas`), which renders
  the code into a fresh canvas we fully control. The circular Stampd tile (cream disc + the
  two-coin mark with the four-point star, drawn in canvas to match `StampdLogo`) is burned into
  the centre of the QR at ~11% of the QR width radius (~22% of the QR width diameter).
- The branded QR is now one shared asset (`buildQrCanvas`) consumed by both the flyer panel and
  the "Download QR only" composite, so the logo can never be out of sync between outputs.
- Removed the "It takes ten seconds. Thank you." line. "Made free with Stampd . stampd.co" was
  not present anywhere in the repo (confirmed by grep).
- `level="M"` error correction keeps the logo inside the correction budget.

## Verification evidence (run via `verify/verify-flyer.mjs`, identical render pipeline)
- `verify/flyer-preview.png` — dark flyer, no tagline text, QR carries the circular Stampd mark.
- `verify/branded-qr.png` and `verify/qr-only.png` — dark modules, cream circular tile with the
  coin mark centred, white surround on the QR-only output.
- All three outputs decode to the review URL with pyzbar at full size (1080/680/560px) **and**
  at a simulated 350px phone-scan size.
- `npm run build` succeeds and `npm run lint` (tsc --noEmit) is clean.

## Follow-up fix: logo proportions
Measured the reference image: tile diameter ≈ 84% of QR width; each coin diameter ≈ 55% of the tile; coins overlap (front coin shifted down-right ≈ 0.36 × coin radius). Back coin is an outlined ring only; front coin is filled dark with the cream four-point star. With the larger tile, error correction was raised from M to H (level H tolerates ~30% damage; the 42%-width tile exceeds M's ~15% budget). All outputs verified decoding at full size and 350px simulated scan size with pyzbar.
