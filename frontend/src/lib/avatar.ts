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
