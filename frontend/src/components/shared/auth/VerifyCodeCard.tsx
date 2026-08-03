import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useMotion } from "../../../lib/motion";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 30;

export function VerifyCodeCard({
  email,
  verify,
  resend,
  onVerified,
  size,
}: {
  email: string;
  verify: (code: string) => Promise<void>;
  resend: () => Promise<void>;
  onVerified: () => void;
  size: "full" | "inline";
}) {
  const m = useMotion();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = async (code: string) => {
    if (code.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      await verify(code);
      onVerified();
    } catch (err) {
      const codeName = (err as Error & { code?: string }).code;
      if (codeName === "OTP_LOCKED") {
        setLocked(true);
      } else {
        setError((err as Error).message || "That code is incorrect.");
        setDigits("");
      }
    } finally {
      setVerifying(false);
    }
  };

  const onChange = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setDigits(clean);
    if (clean.length === CODE_LENGTH) void submit(clean);
  };

  const onResend = async () => {
    if (cooldown > 0) return;
    setLocked(false);
    setError(null);
    setDigits("");
    try {
      await resend();
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      // resend() callers already surface their own toast on failure.
    }
    inputRef.current?.focus();
  };

  const boxTone =
    size === "full"
      ? "border-[var(--lp-line)] bg-white/[0.04] text-[var(--lp-ink)]"
      : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]";
  const mutedTone = size === "full" ? "text-[var(--lp-muted)]" : "text-[var(--muted)]";
  const boxSize = size === "full" ? "h-14 w-11 text-xl" : "h-10 w-8 text-base";

  return (
    <div className="relative">
      <p className={`text-sm ${mutedTone}`}>
        Enter the 6-digit code sent to <span className="font-medium">{email}</span>.
      </p>

      {locked ? (
        <div className="mt-4 flex flex-col items-start gap-2">
          <p className={`text-sm ${mutedTone}`}>Too many tries — request a new code.</p>
          <button
            type="button"
            onClick={onResend}
            disabled={cooldown > 0}
            className="text-sm font-medium underline underline-offset-4 disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
          </button>
        </div>
      ) : (
        <>
          <motion.div
            className="relative mt-4 flex gap-2"
            animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
            transition={m.pick(m.spring("numberChange"), { duration: 0 })}
          >
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <div
                key={i}
                className={`flex ${boxSize} items-center justify-center rounded-2xl border font-mono ${boxTone} ${
                  i === digits.length ? "border-[var(--lp-green)]" : ""
                }`}
              >
                {digits[i] || ""}
              </div>
            ))}
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={digits}
              onChange={(e) => onChange(e.target.value)}
              disabled={verifying}
              aria-label="6-digit verification code"
              className="absolute inset-0 h-full w-full cursor-default opacity-0"
            />
          </motion.div>

          {error && <p className="mt-2 text-xs font-medium text-[var(--err)]">{error}</p>}

          <p className={`mt-4 text-sm ${mutedTone}`}>
            Didn't get it?{" "}
            <button
              type="button"
              onClick={onResend}
              disabled={cooldown > 0}
              className="font-medium underline underline-offset-4 disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
