// Colour maths behind the tenant-colour contract.
//
// The system runs two colour roles that must never be confused:
//   --primary (a fixed green)  value & action — the points figure, the scan
//     button, earn/redeem semantics.
//   --brand (the tenant hue)   identity only — logo tiles, business name,
//     banners, the balance card's accent bar.
//
// An outlet can pick any brand colour, including near-white, neon, or a green
// close enough to the value green to be mistaken for it. Nothing here trusts
// the input: every derived token is checked against a real contrast ratio, and
// a colliding green is detected and stepped aside from.

const FALLBACK = "#0FA968";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1)}`;
}

/** Darkens a #rrggbb hex toward black by `amount` (0-1). */
export function darken(hex: string, amount = 0.22): string {
  const rgb = parseHex(hex);
  if (!rgb) return FALLBACK;
  return toHex({ r: rgb.r * (1 - amount), g: rgb.g * (1 - amount), b: rgb.b * (1 - amount) });
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}

/** WCAG contrast ratio between two hex colours. 1 = identical, 21 = max. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * A text-safe version of the tenant hue: darkens in small steps until it
 * clears 4.5:1 against the surface it sits on. A pale yellow or near-white
 * brand colour therefore never lands on text as-is.
 */
export function readableInk(hex: string, on = "#FFFFFF", target = 4.5): string {
  if (!parseHex(hex)) return FALLBACK;
  let out = hex.startsWith("#") ? hex : `#${hex}`;
  for (let i = 0; i < 20 && contrast(out, on) < target; i++) {
    out = darken(out, 0.08);
  }
  return out;
}

/**
 * What to put ON a tenant-coloured fill — white or the ink, whichever has more
 * contrast against it. A neon-yellow logo tile gets dark text, a deep indigo
 * one gets white, without either being special-cased.
 */
export function onColor(hex: string, ink = "#14201C"): string {
  if (!parseHex(hex)) return "#FFFFFF";
  return contrast(hex, "#FFFFFF") >= contrast(hex, ink) ? "#FFFFFF" : ink;
}

/** Hue in degrees (0-360), or null for an unparseable/achromatic colour. */
export function hue(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** HSV saturation (0-1). */
export function saturation(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  return max === 0 ? 0 : (max - min) / max;
}

// The value green sits at ~155deg. A tenant hue inside this window, if it is
// saturated enough to actually read as green, is close enough that a customer
// could mistake an identity accent for a value figure.
const VALUE_GREEN_HUE = 155;
const COLLISION_WINDOW = 24;
const COLLISION_MIN_SATURATION = 0.25;

/**
 * True when a tenant's brand colour is close enough to the value green to be
 * confused with it.
 *
 * This is the one case the two-role colour split cannot resolve on its own: if
 * an outlet's identity green and the "how much can I spend" green are the same
 * green, the split stops carrying meaning. Rather than nudge the tenant's hue
 * (which would misrepresent their brand) or move the value green (which is
 * fixed platform-wide, and the whole point), identity steps aside — see
 * `identityAccent`.
 */
export function collidesWithValueGreen(hex: string): boolean {
  const h = hue(hex);
  if (h === null) return false;
  if (saturation(hex) < COLLISION_MIN_SATURATION) return false;
  // Shortest distance around the hue circle, 0-180.
  const delta = Math.abs(((h - VALUE_GREEN_HUE + 540) % 360) - 180);
  return delta <= COLLISION_WINDOW;
}

/**
 * The colour to use for identity accents (the balance card's bar, category
 * chips, banner washes). Falls back to the ink for a tenant whose brand green
 * collides with the value green, so the green on screen always means value.
 * Logo tiles and the business name keep the true brand colour regardless —
 * those are unambiguously identity and never sit next to a points figure.
 */
export function identityAccent(hex: string, ink = "#14201C"): string {
  return collidesWithValueGreen(hex) ? ink : hex;
}

/** Every tenant-derived token, resolved in one pass. */
export interface TenantPalette {
  brand: string;
  brandDeep: string;
  brandInk: string;
  brandOn: string;
  accent: string;
  collides: boolean;
}

export function tenantPalette(input: string | undefined | null, surface = "#FFFFFF"): TenantPalette {
  const brand = (input && parseHex(input) && input.trim()) || FALLBACK;
  return {
    brand,
    brandDeep: darken(brand),
    brandInk: readableInk(brand, surface),
    brandOn: onColor(brand),
    accent: identityAccent(brand),
    collides: collidesWithValueGreen(brand),
  };
}
