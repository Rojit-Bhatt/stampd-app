// Resolving "which Google listing is this" to "a URL whose QR opens the review
// form". Two paths, because the search path depends on a billed API key that
// may not be configured, may be revoked, or may be over quota — and a tool
// that only works when Google is paid for is not much of a free tool.

/** The canonical review URL for a Place ID. */
export function reviewUrlForPlaceId(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/** Shown to the visitor when a paste is rejected. */
export const ACCEPTED_PASTE_FORMS = [
  "https://g.page/r/…/review",
  "https://search.google.com/local/writereview?placeid=…",
  "https://maps.app.goo.gl/…",
  "a Place ID like ChIJ…",
] as const;

const G_PAGE = /^https:\/\/g\.page\/r\/[A-Za-z0-9_-]+\/review\/?$/;
const WRITE_REVIEW = /^https:\/\/search\.google\.com\/local\/writereview\?placeid=[A-Za-z0-9_-]+$/;
// Short share links are encoded verbatim rather than resolved: following one
// needs a redirect fetch that CORS blocks in the browser, and the short link
// opens the listing correctly on a phone anyway.
const MAPS_SHORT = /^https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+$/;
// Loosest of the four, so it is matched last — a Place ID is just an opaque
// token and would otherwise swallow anything that is not a recognised URL.
const PLACE_ID = /^[A-Za-z0-9_-]{20,}$/;

/**
 * @returns the URL to encode in the QR, or null if the paste is not one of the
 * four accepted forms.
 */
export function parsePastedReviewTarget(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (G_PAGE.test(value)) return value;
  if (WRITE_REVIEW.test(value)) return value;
  if (MAPS_SHORT.test(value)) return value;
  if (PLACE_ID.test(value)) return reviewUrlForPlaceId(value);
  return null;
}
