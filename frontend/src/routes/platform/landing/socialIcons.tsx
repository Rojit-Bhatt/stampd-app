import type { ReactNode } from "react";

// Hand-rolled brand glyphs rather than an icon package: lucide has no TikTok
// mark, and mixing one library's icons with a hand-drawn odd-one-out reads
// worse than drawing all six to the same weight. All are 24x24, currentColor,
// so they inherit the footer's ink.

export type SocialKey = "instagram" | "facebook" | "tiktok" | "x" | "linkedin" | "youtube";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const SOCIAL_ICONS: Record<SocialKey, ReactNode> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" {...stroke} />
      <circle cx="12" cy="12" r="4" {...stroke} />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
    </>
  ),
  facebook: (
    <path
      d="M14.5 8.5h2V5.8h-2.2c-2 0-3.1 1.2-3.1 3.2v1.6H9v2.7h2.2V21h2.8v-7.7h2.2l.4-2.7h-2.6V9.3c0-.5.2-.8.5-.8Z"
      fill="currentColor"
    />
  ),
  tiktok: (
    <path
      d="M14.2 3v10.7a2.9 2.9 0 1 1-2.4-2.85V8.1a5.9 5.9 0 1 0 5.4 5.9V9.2a6.4 6.4 0 0 0 3.3.95V6.9a3.7 3.7 0 0 1-3.3-3.9Z"
      fill="currentColor"
    />
  ),
  x: (
    <path
      d="M4 4l7 8.6L4.4 20H6l5.7-6.4L16.6 20H20l-7.3-9 6.2-7h-1.6l-5.3 6L8 4Zm2.6 1.2h1.7l9.1 13.6h-1.7Z"
      fill="currentColor"
    />
  ),
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" {...stroke} />
      <path d="M7.5 10.5V17M7.5 7.6v.1M11.5 17v-3.6a2 2 0 0 1 4 0V17" {...stroke} />
    </>
  ),
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" {...stroke} />
      <path d="M10.5 9.8l5 2.2-5 2.2Z" {...stroke} />
    </>
  ),
};

export const SOCIAL_LABELS: Record<SocialKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

// Fixed display order, independent of object key order on the response.
export const SOCIAL_ORDER: SocialKey[] = [
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "linkedin",
  "youtube",
];
