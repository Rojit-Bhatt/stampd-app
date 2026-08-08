import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import toast from "@/lib/toast";

import { apiRequest } from "../../lib/api";
import { useMotion } from "../../lib/motion";

interface VerifiedStaff {
  userId: string;
  name: string;
  staffRole: "manager" | "staff" | null;
}

interface StaffPinGateProps {
  /** settings.staffPinRequired — whether this outlet has turned PINs on. */
  required: boolean;
  /**
   * Render prop: `pin` is the currently-verified 4-digit PIN (null when the
   * outlet doesn't require one, or before anyone has identified themselves),
   * to be re-sent with every generate call — the server re-verifies every
   * action, it is never trusted to remember that it verified earlier.
   * `onPinRejected` drops the gate back to the pad; call it when a page's
   * OWN generate call comes back 401 PIN_REJECTED (the PIN was reset
   * mid-shift), rather than surfacing a bare error on a screen that still
   * looks unlocked.
   */
  children: (pin: string | null, onPinRejected: () => void) => ReactNode;
}

const PAD_ROWS: (string | null)[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [null, "0", "back"],
];

// A shared counter device, signed in once, with several people working the
// till across a shift — the PIN says which of them is at the counter right
// now. Held in React state only, for the life of the tab: never
// localStorage, never sessionStorage, never a cookie.
export function StaffPinGate({ required, children }: StaffPinGateProps) {
  const m = useMotion();
  const [staff, setStaff] = useState<VerifiedStaff | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  // Not required at this outlet: unchanged, byte-identical to before this
  // feature existed.
  if (!required) {
    return <>{children(null, () => {})}</>;
  }

  const onPinRejected = () => {
    setStaff(null);
    setPin(null);
    setEntry("");
  };

  const submit = async (candidate: string) => {
    setVerifying(true);
    try {
      const res = await apiRequest<{ success: boolean; staff: VerifiedStaff }>(
        "/api/admin/verify-pin",
        { method: "POST", role: "admin", body: { pin: candidate } },
      );
      setStaff(res.staff);
      setPin(candidate);
      setEntry("");
    } catch (err) {
      setEntry("");
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      toast.error((err as Error).message || "That PIN doesn't match anyone here.");
    } finally {
      setVerifying(false);
    }
  };

  const press = (digit: string) => {
    if (verifying) return;
    const next = (entry + digit).slice(0, 4);
    setEntry(next);
    if (next.length === 4) submit(next);
  };

  const backspace = () => setEntry((e) => e.slice(0, -1));

  if (staff) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between rounded-[var(--radius-btn)] bg-[var(--surface-2)] px-4 py-2.5">
          <span className="text-sm font-semibold text-[var(--ink)]">
            {staff.name} · {staff.staffRole ?? "admin"}
          </span>
          <button
            type="button"
            onClick={onPinRejected}
            className="text-xs font-bold uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Switch user
          </button>
        </div>
        {children(pin, onPinRejected)}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[320px]">
      <header className="mb-6 text-center">
        <h1 className="font-display text-xl font-bold text-[var(--ink)]">Who&rsquo;s at the counter?</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Enter your 4-digit PIN.</p>
      </header>

      {/* Hidden field so a hardware keypad works too. Digits are masked —
          the dots below are the only display, and there is no reveal toggle. */}
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        value={entry}
        disabled={verifying}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
          setEntry(digits);
          if (digits.length === 4) submit(digits);
        }}
        aria-label="Staff PIN"
        className="sr-only"
      />

      <motion.div
        animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
        transition={m.pick({ duration: 0.4, ease: "easeOut" }, { duration: 0 })}
        className="mb-8 flex justify-center gap-3"
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              i < entry.length
                ? "border-[var(--primary)] bg-[var(--primary)]"
                : "border-[var(--line)] bg-transparent"
            }`}
          />
        ))}
      </motion.div>

      <div className="grid grid-cols-3 gap-3">
        {PAD_ROWS.flat().map((d, i) => {
          if (d === null) return <div key={i} />;
          if (d === "back") {
            return (
              <button
                key={i}
                type="button"
                disabled={verifying}
                onClick={backspace}
                aria-label="Delete digit"
                className="stamp-interactive flex h-16 items-center justify-center rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] text-lg font-bold text-[var(--muted)] shadow-ambient disabled:opacity-50"
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={i}
              type="button"
              disabled={verifying}
              onClick={() => press(d)}
              className="stamp-interactive flex h-16 items-center justify-center rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] text-xl font-bold text-[var(--ink)] shadow-ambient disabled:opacity-50"
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
