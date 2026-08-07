# Group D — QR download: white background + centered logo

## Problem
`ReviewFlyer.tsx`'s "Download QR only" button (used from the platform's `/review-qr` marketing-flyer generator) downloads the raw QR canvas with a **deliberately transparent** background (`QRCodeCanvas bgColor="rgba(0,0,0,0)"`), explained in a code comment as intentional so the QR-only PNG can be layered onto arbitrary artwork. The UI even warns the user about this ("dark code on a dark surface will not scan"). This is the bug: the user wants the standalone QR download to have a white background and a centered Stampd logo, not a transparent one.

## Design
- Keep the existing off-screen `QRCodeCanvas` (still transparent — it's the source used for the flyer composite too, unaffected).
- Change the "Download QR only" button handler: instead of downloading the raw QR canvas directly, composite onto a new canvas first:
  1. Fill a white background sized to the QR + margin.
  2. `drawImage` the QR canvas onto it.
  3. `drawImage` the existing `public/pwa-512x512.png` coin logo, centered, sized small enough (e.g. ~18-20% of QR width) to sit inside the QR's error-correction tolerance (`level="M"` already gives ~15% recovery — keep logo comfortably under that share of the QR area, matching common QR-with-logo practice).
  4. Download this composited canvas instead of the raw one.
- Remove the "transparent background" warning copy since it no longer applies to this button; keep the button separate from "Download flyer" (still two distinct downloads: full flyer vs. white QR-with-logo).

## Testing
- Manual: click "Download QR only", open the PNG, confirm white background and centered logo, and scan it with a phone camera to confirm it still resolves (logo doesn't break scannability).
