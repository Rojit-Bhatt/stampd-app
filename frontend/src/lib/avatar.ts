import { apiUrl } from "./api";

/** Longest edge of a stored avatar, in CSS pixels before DPR. */
const AVATAR_SIZE = 256;
/** WebP quality. 0.82 is where the file stops shrinking much but still looks clean at 96px. */
const AVATAR_QUALITY = 0.82;

/**
 * Where an account's picture is served from, or null when it has none.
 *
 * The `v` is the account's `avatarVersion`, which the backend bumps on every
 * upload AND every removal. That is what lets the response be marked
 * `immutable` — the URL for a given picture never serves different bytes, so
 * the browser (and any CDN in front of it) can keep it forever and a change
 * simply asks for a different URL. Without the version this would need a
 * revalidation round-trip on every avatar on every page.
 */
export function avatarUrl(accountId: string | null | undefined, version: number | undefined): string | null {
  if (!accountId || !version) return null;
  return apiUrl(`/api/customer-auth/avatar/${accountId}?v=${version}`);
}

/**
 * Resizes and re-encodes a picked image to a small square WebP, in the
 * browser, before it is ever uploaded.
 *
 * This is the whole storage and load-time story. A phone camera photo is
 * 3-8MB of 4000px JPEG; what the app ever displays is a 96px circle. Doing
 * this client-side means the 8MB never crosses the network, never needs a
 * server-side image pipeline (the backend has no `sharp`), and never sits in
 * the database — the row that lands is ~10-20KB. Cropping to a centred square
 * here rather than with CSS also means the bytes stored match what's shown,
 * instead of storing pixels only to hide them.
 */
export async function resizeToAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    // Cover-crop: take the largest centred square, so a portrait photo keeps
    // its subject instead of being squashed to fit.
    const edge = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - edge) / 2;
    const sy = (bitmap.height - edge) / 2;
    // Never upscale — a 64px source should stay 64px rather than being blown
    // up to 256 and stored at four times the size it has detail for.
    const size = Math.min(AVATAR_SIZE, edge);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that image.");
    ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", AVATAR_QUALITY);
    });
    if (!blob) throw new Error("Could not process that image.");
    return blob;
  } finally {
    // Frees the decoded bitmap immediately rather than waiting for GC — this
    // can be tens of megabytes for a modern phone photo.
    bitmap.close();
  }
}
