import { useState } from "react";
import { avatarUrl } from "../../lib/avatar";

interface CustomerAvatarProps {
  accountId: string | null | undefined;
  avatarVersion: number | undefined;
  name: string | undefined;
  /** Rendered size in px. Also drives the initial's font size. */
  size?: number;
  /**
   * Announce the account this belongs to. Off by default because the common
   * case is decorative — inside a labelled Link ("Profile"), where announcing
   * the name again is noise. Turn it on where the avatar stands alone and IS
   * the only signal of who is signed in.
   */
  labelled?: boolean;
  className?: string;
}

/**
 * A customer's picture, falling back to their initial.
 *
 * The fallback is not just for "hasn't uploaded one" — it also catches a
 * picture that fails to load (offline, or an avatarVersion cached locally
 * that's ahead of what the server has). An avatar is decoration; it must
 * never leave a broken-image icon sitting in a header.
 */
export function CustomerAvatar({
  accountId,
  avatarVersion,
  name,
  size = 36,
  labelled = false,
  className = "",
}: CustomerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = avatarUrl(accountId, avatarVersion);
  const initial = (name || "?").charAt(0).toUpperCase();
  const label = labelled && name ? `Signed in as ${name}` : null;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={label || ""}
        width={size}
        height={size}
        // Never blocks first paint: an avatar is the least important pixel on
        // any page it appears on.
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`flex-shrink-0 rounded-full bg-[var(--surface-2)] object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      // Decorative unless `labelled`: without a name to announce there is
      // nothing here a screen reader can usefully say about a letter.
      aria-hidden={label ? undefined : "true"}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      className={`flex flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-bold text-[var(--ink)] ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
}
