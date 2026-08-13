import { useReducedMotion } from "motion/react";
import { useState } from "react";

import { usePlatformContact } from "../../../hooks/usePlatformContact";

/** Strips spaces, dashes and a leading + so the number is WhatsApp-link-safe. */
export const toWaNumber = (phone: string) => phone.replace(/[^\d]/g, "");

/**
 * Contact float. Kept because WhatsApp is how this market actually makes
 * contact, and because it gives every "Talk to us" CTA a real destination in
 * the absence of self-serve signup — but rebuilt out of this page's own cream
 * / ink / radius vocabulary rather than the stock green badge.
 *
 * Renders nothing when no phone is configured: no hardcoded number ships.
 */
export function WhatsAppFloat() {
  const { data: contact } = usePlatformContact();
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  const number = contact?.phone ? toWaNumber(contact.phone) : "";
  if (!number) return null;

  const expanded = open && !reduced;

  return (
    <a
      href={`https://api.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(
        "Hi! I have a question about Stampd."
      )}`}
      target="_blank"
      rel="noreferrer noopener"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-label="Chat with us on WhatsApp"
      // z-40 keeps it under the nav (z-50). The border matters once the cream
      // footer is fully revealed — without it a cream pill on a cream plane
      // has no edge.
      className={`fixed bottom-6 right-6 z-40 flex h-14 items-center overflow-hidden rounded-[74px] border border-[#14201C]/20 bg-[var(--lp-cream)] text-[#14201C] shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-[width,padding] duration-300 motion-reduce:transition-none ${
        expanded ? "w-[188px] gap-3 px-5" : "w-14 justify-center gap-0 px-0"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 flex-shrink-0" aria-hidden="true">
        <path
          d="M20 11.7a8 8 0 0 1-11.9 7L4 20l1.4-4a8 8 0 1 1 14.6-4.3Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 9.4c.3 1.9 2 3.6 3.9 3.9l.9-1.1 1.6.7c-.2 1-1.1 1.5-2.1 1.4-2.6-.3-4.7-2.4-5-5-.1-1 .4-1.9 1.4-2.1l.7 1.6-1.4.6Z"
          fill="currentColor"
        />
      </svg>
      {/* The label must collapse its WIDTH, not just its opacity. A zero-opacity
          label still takes ~83px of layout, and `justify-center` then centres
          icon+label together — pushing the icon clean out of the 56px circle,
          where `overflow-hidden` clips it away. That renders as an empty cream
          disc with no glyph at all. */}
      <span
        className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 motion-reduce:transition-none ${
          expanded ? "w-auto opacity-100" : "w-0 opacity-0"
        }`}
      >
        Chat with us
      </span>
    </a>
  );
}
