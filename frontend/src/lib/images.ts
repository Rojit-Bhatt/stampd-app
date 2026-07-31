import { apiUrl } from "./api";

export type ImageOwnerType = "branding_logo" | "branding_banner" | "reward" | "event";

const TARGETS: Record<ImageOwnerType, { w: number; h: number; mode: "square" | "aspect" }> = {
  branding_logo: { w: 256, h: 256, mode: "square" },
  branding_banner: { w: 800, h: 300, mode: "aspect" },
  reward: { w: 800, h: 800, mode: "aspect" },
  event: { w: 800, h: 800, mode: "aspect" },
};

/**
 * Resize on the client and hand back a Blob rather than a data URI.
 *
 * WebP first: typically 25-35% smaller than JPEG at the same visual quality,
 * and the backend accepts it. JPEG is the fallback for any browser whose
 * canvas returns null for the webp type — toBlob does not throw, it just
 * yields null, so the fallback has to be explicit.
 */
export async function resizeImageToBlob(
  file: File,
  maxWidth: number,
  maxHeight: number,
  mode: "square" | "aspect",
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let width = maxWidth;
  let height = maxHeight;
  if (mode === "aspect") {
    const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
    width = Math.round(bitmap.width * scale);
    height = Math.round(bitmap.height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");

  if (mode === "square") {
    // Cover-crop to the square rather than squashing it.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, width, height);
  } else {
    ctx.drawImage(bitmap, 0, 0, width, height);
  }
  bitmap.close();

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  const webp = await toBlob("image/webp", 0.85);
  if (webp) return webp;
  const jpeg = await toBlob("image/jpeg", 0.85);
  if (jpeg) return jpeg;
  throw new Error("Could not read that image.");
}

/**
 * Resize, encode and upload in one call. Returns the id to store on the
 * owning document and the URL to render immediately.
 */
export async function uploadImage(
  file: File,
  ownerType: ImageOwnerType,
): Promise<{ id: string; url: string }> {
  const target = TARGETS[ownerType];
  const blob = await resizeImageToBlob(file, target.w, target.h, target.mode);

  const form = new FormData();
  form.append("file", blob, "upload.webp");
  form.append("ownerType", ownerType);

  const token = localStorage.getItem("admin_auth_token");
  const res = await fetch(apiUrl("/api/admin/images"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || "Couldn't upload that image — try again.");
  return { id: body.id as string, url: body.url as string };
}

/**
 * Resolution order, matching the backend's read contract: a stored imageId
 * wins, otherwise whatever legacy value the document already carries (an
 * external URL, or a base64 data URI written before this collection existed).
 *
 * Goes through apiUrl so it resolves against the backend origin in
 * production, where the frontend is served from a different host.
 */
export function resolveImageUrl(
  imageId: string | null | undefined,
  fallbackUrl: string | null | undefined,
): string {
  if (imageId) return apiUrl(`/api/images/${imageId}`);
  return fallbackUrl || "";
}
