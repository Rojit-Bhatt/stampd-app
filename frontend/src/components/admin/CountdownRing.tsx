import { useMotion } from "../../lib/motion";

interface CountdownRingProps {
  /** Seconds left. */
  remaining: number;
  /** Seconds the code was issued for, so the ring drains proportionally. */
  total: number;
}

// The 30-second life of a QR code, drawn so staff can read it from across a
// counter without parsing digits. Goes amber in the last few seconds — the
// point at which it's worth waiting for the next code rather than asking the
// customer to hurry.
//
// Shared by the earn and redeem screens; both codes have the same short life
// and the same failure if it runs out.
export function CountdownRing({ remaining, total }: CountdownRingProps) {
  const { prefersReduced } = useMotion();
  const size = 60;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const urgent = remaining <= 6;
  const color = urgent ? "var(--warn)" : "var(--primary)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: prefersReduced ? "none" : "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span
        className="absolute inset-0 grid place-items-center font-numeral text-xl leading-none"
        style={{ color }}
      >
        {remaining}
      </span>
    </div>
  );
}

export default CountdownRing;
