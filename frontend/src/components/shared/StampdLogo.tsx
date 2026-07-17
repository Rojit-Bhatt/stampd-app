interface StampdLogoProps {
  size?: number;
  tile?: boolean;
  className?: string;
}

// The Stampd mark: one coin earned on top of another, the top one struck
// with a point. Colors are fixed, not tenant-themed — this is the platform's
// own identity, distinct from --brand/--plat which theme per-tenant UI.
//
// The front coin is drawn last and filled opaque so it occludes the back
// coin's stroke without needing a mask.
export function StampdLogo({ size = 24, tile = false, className = "" }: StampdLogoProps) {
  const iconSize = tile ? Math.round(size * 0.64) : size;

  const mark = (
    <svg
      viewBox="0 0 100 100"
      width={iconSize}
      height={iconSize}
      className={tile ? "" : className}
      aria-hidden="true"
    >
      <circle cx="36" cy="38" r="24" fill="none" stroke="#1F1B18" strokeWidth="6" />
      <circle cx="62" cy="62" r="24" fill="#C15D2C" stroke="#1F1B18" strokeWidth="6" />
      <path
        transform="translate(62 62)"
        fill="#F3ECE2"
        d="M0,-12 Q1.7,-1.7 12,0 Q1.7,1.7 0,12 Q-1.7,1.7 -12,0 Q-1.7,-1.7 0,-12 Z"
      />
    </svg>
  );

  if (!tile) return mark;

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-[22%] ${className}`}
      style={{ width: size, height: size, background: "#F3ECE2" }}
    >
      {mark}
    </div>
  );
}
