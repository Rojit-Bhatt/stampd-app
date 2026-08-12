// Hand-built SVG illustrations for the "What you get" carousel — abstract
// representations of each feature, not app screenshots. Every shape uses the
// landing page's own dark-panel tokens (--lp-*), so they're themeable and
// carry no external image weight. One export per FEATURES.blocks id
// (data.ts), wired in FeaturePile.tsx.
//
// Common frame: a 400x280 panel, --lp-panel background, a thin --lp-line
// border baked in via the group stroke, --lp-green for the "live"/value
// accent, --lp-cream for the highest-emphasis mark. Kept simple and iconic —
// these read at card size, not as posters.

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 400 280" className="h-full w-full" role="img" aria-hidden="true">
      <rect width="400" height="280" fill="var(--lp-panel)" />
      {children}
    </svg>
  );
}

export function PointsEngineArt() {
  return (
    <Frame>
      {/* A dial: the earn rate, swept as an arc. */}
      <circle cx="200" cy="150" r="86" fill="none" stroke="var(--lp-line)" strokeWidth="14" />
      <path
        d="M200 64 A86 86 0 0 1 273 194"
        fill="none"
        stroke="var(--lp-green)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <text x="200" y="142" textAnchor="middle" fontSize="40" fontWeight="700" fill="var(--lp-cream)">
        10%
      </text>
      <text x="200" y="168" textAnchor="middle" fontSize="12" fill="var(--lp-muted)" letterSpacing="1.5">
        EARN RATE
      </text>
      <rect x="140" y="216" width="120" height="8" rx="4" fill="var(--lp-line)" />
    </Frame>
  );
}

export function CampaignsArt() {
  return (
    <Frame>
      {/* A multiplier badge with a pulse ring — "live right now". */}
      <circle cx="200" cy="130" r="60" fill="none" stroke="var(--lp-green)" strokeOpacity="0.25" strokeWidth="10" />
      <circle cx="200" cy="130" r="44" fill="var(--lp-green)" />
      <text x="200" y="144" textAnchor="middle" fontSize="34" fontWeight="800" fill="#0B1712">
        2×
      </text>
      <rect x="150" y="204" width="100" height="22" rx="11" fill="var(--lp-line)" />
      <text x="200" y="219" textAnchor="middle" fontSize="11" fill="var(--lp-cream)" letterSpacing="1">
        LIVE
      </text>
    </Frame>
  );
}

export function RewardsArt() {
  return (
    <Frame>
      {/* Three reward chips of different weights. */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${86 + i * 46})`}>
          <rect x="90" y="0" width="220" height="34" rx="17" fill="var(--lp-line)" />
          <circle cx="112" cy="17" r="10" fill={i === 0 ? "var(--lp-green)" : "var(--lp-muted)"} fillOpacity={i === 0 ? 1 : 0.5} />
          <rect x="132" y="12" width={90 - i * 12} height="10" rx="5" fill="var(--lp-muted)" fillOpacity="0.6" />
          <text x="288" y="21" textAnchor="end" fontSize="13" fontWeight="700" fill="var(--lp-cream)">
            {[500, 350, 200][i]}
          </text>
        </g>
      ))}
    </Frame>
  );
}

export function RedeemArt() {
  return (
    <Frame>
      {/* A QR-ish mark being scanned, with a checkmark landing. */}
      <rect x="150" y="80" width="100" height="100" rx="10" fill="var(--lp-line)" />
      {[[160, 90], [204, 90], [160, 134]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="26" height="26" rx="4" fill="var(--lp-cream)" fillOpacity="0.85" />
      ))}
      <circle cx="200" cy="216" r="26" fill="var(--lp-green)" />
      <path
        d="M188 216l9 9 17-19"
        fill="none"
        stroke="#0B1712"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function InsightsArt() {
  return (
    <Frame>
      {/* A small bar/line combo, standing in for the overview KPIs. */}
      <g transform="translate(96 100)">
        {[26, 44, 34, 58, 46, 66].map((h, i) => (
          <rect key={i} x={i * 30} y={72 - h} width="16" height={h} rx="3" fill="var(--lp-line)" />
        ))}
        <polyline
          points="8,50 38,34 68,44 98,20 128,30 158,10"
          fill="none"
          stroke="var(--lp-green)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <text x="200" y="216" textAnchor="middle" fontSize="12" fill="var(--lp-muted)" letterSpacing="1.5">
        VISITS · REPEAT RATE
      </text>
    </Frame>
  );
}

export function MultiOutletArt() {
  return (
    <Frame>
      {/* Three outlet tiles under one umbrella. */}
      <rect x="170" y="60" width="60" height="18" rx="9" fill="var(--lp-green)" fillOpacity="0.9" />
      {[[110, 110], [170, 150], [230, 110]].map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width="60" height="60" rx="12" fill="var(--lp-line)" />
          <circle cx={x + 30} cy={y + 24} r="10" fill="var(--lp-cream)" fillOpacity="0.85" />
          <rect x={x + 14} y={y + 40} width="32" height="6" rx="3" fill="var(--lp-muted)" fillOpacity="0.6" />
        </g>
      ))}
    </Frame>
  );
}

export const FEATURE_ART: Record<string, () => React.ReactElement> = {
  "points-engine": PointsEngineArt,
  campaigns: CampaignsArt,
  rewards: RewardsArt,
  redeem: RedeemArt,
  insights: InsightsArt,
  "multi-outlet": MultiOutletArt,
};
