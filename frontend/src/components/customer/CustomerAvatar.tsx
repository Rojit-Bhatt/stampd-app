import { useState } from "react";
import { avatarUrl } from "../../lib/avatar";

interface CustomerAvatarProps {
  accountId: string | null | undefined;
  avatarVersion: number | undefined;
  name: string | undefined;
  /** Rendered size in px. Also drives the initial's font size. */
  size?: number;
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
  className = "",
}: CustomerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = avatarUrl(accountId, avatarVersion);
  const initial = (name || "?").charAt(0).toUpperCase();

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
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
      aria-hidden="true"
      className={`flex flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-bold text-[var(--ink)] ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
}
