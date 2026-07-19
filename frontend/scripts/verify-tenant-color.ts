// Verifies the tenant-colour contract holds for hostile brand colours.
//
// Run manually after touching lib/color.ts:
//   npx tsx frontend/scripts/verify-tenant-color.ts
//
// An outlet can set branding.primaryColor to anything. Two invariants have to
// survive that, and neither is visible by eyeballing a screen with the demo
// seed's brown in it:
//
//   1. --brand-ink clears 4.5:1 on the surface, and --brand-on clears 4.5:1 on
//      the brand fill. A pale yellow or near-white outlet colour must never
//      land on text as-is.
//   2. A brand colour that is itself green is detected, so identity accents can
//      step aside and green on screen always means value, never identity.
//
// Invariant 2 shipped inverted the first time (magenta flagged as colliding,
// the value green itself not flagged) and this check is what caught it.

import { tenantPalette, contrast } from "../src/lib/color";

interface Case {
  hex: string;
  note: string;
  expectCollision: boolean;
}

const CASES: Case[] = [
  { hex: "#B8460C", note: "burnt orange", expectCollision: false },
  { hex: "#3D6BE5", note: "indigo", expectCollision: false },
  { hex: "#E6C200", note: "yellow — unreadable as text", expectCollision: false },
  { hex: "#D6249B", note: "magenta", expectCollision: false },
  { hex: "#FFFFFF", note: "white — worst case for text", expectCollision: false },
  { hex: "#F8F8F0", note: "near-white cream", expectCollision: false },
  { hex: "#71472F", note: "the old Coffesarowar brown", expectCollision: false },
  { hex: "#111111", note: "near-black", expectCollision: false },
  { hex: "#0FA968", note: "the value green itself", expectCollision: true },
  { hex: "#2ECC71", note: "a softer green", expectCollision: true },
  { hex: "#00FF88", note: "neon green", expectCollision: true },
  { hex: "#7FBF9F", note: "desaturated sage — reads green", expectCollision: true },
  { hex: "#3D6B5E", note: "deep teal-green", expectCollision: true },
  { hex: "nonsense", note: "unparseable — falls back", expectCollision: true },
];

const SURFACE = "#FFFFFF";
const INK = "#14201C";
let failures = 0;

function fail(hex: string, msg: string) {
  failures++;
  console.error(`  FAIL  ${hex}  ${msg}`);
}

for (const { hex, note, expectCollision } of CASES) {
  const p = tenantPalette(hex);
  const inkRatio = contrast(p.brandInk, SURFACE);
  const onRatio = contrast(p.brandOn, p.brand);

  console.log(
    `${hex.padEnd(10)} ${note.padEnd(34)} ink ${p.brandInk} ${inkRatio.toFixed(2).padStart(5)}  ` +
      `on ${p.brandOn} ${onRatio.toFixed(2).padStart(5)}  accent ${p.accent}`,
  );

  if (inkRatio < 4.5) fail(hex, `--brand-ink only ${inkRatio.toFixed(2)}:1 on surface, needs 4.5`);
  if (onRatio < 4.5) fail(hex, `--brand-on only ${onRatio.toFixed(2)}:1 on brand fill, needs 4.5`);
  if (p.collides !== expectCollision) {
    fail(hex, `collision detection said ${p.collides}, expected ${expectCollision}`);
  }
  if (p.collides && p.accent !== INK) {
    fail(hex, `colliding green must hand its accent to the ink, got ${p.accent}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s) — the tenant-colour contract is broken.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} cases pass.`);
