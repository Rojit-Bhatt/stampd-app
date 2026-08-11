# Earn/Redeem Celebration Animation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current opaque, button-driven earn/redeem celebration screens with a transparent, auto-vanishing overlay that shows the real live outlet dashboard blurred behind a brand-new coin-burst (earn) / voucher-reveal (redeem) animation.

**Architecture:** A `CelebrationProvider` (React context + `createPortal`) mounted once inside `TenantScope` (so it survives the route change from claim/redeem pages to the dashboard) exposes `showEarn()`/`showRedeem()`. Trigger sites call `navigate()` to the dashboard immediately and call `showEarn`/`showRedeem` in the same breath; the portal overlay renders fixed above the now-mounting `CustomerDashboard`, blurring it via `backdrop-filter`, and auto-clears itself via an internal timer. No `onDone`/`doneLabel`/button props exist anywhere in the new components.

**Tech Stack:** React 18, react-router-dom, `motion/react` (Framer Motion), Tailwind CSS, TypeScript. No frontend test runner exists in this repo — verification is `npm run lint` (`tsc --noEmit`) plus manual checks in the dev server (see project memory: frontend lacks test infrastructure).

**Model note:** Do the motion/animation choreography work (Tasks 2 and 3) with Opus 5. Do the wiring/integration work (Tasks 1, 4, 5, 6, 7) with Sonnet.

## Global Constraints

- No "go to dashboard" / manual dismiss button anywhere in the new celebration UI — auto-vanish only.
- The dashboard shown behind the overlay must be the real, live, per-outlet `CustomerDashboard` (not `/explore`, not a screenshot).
- Applies to all 3 trigger sites: `ClaimLanding.tsx`, `ScannerModal.tsx`, `RedeemLanding.tsx`.
- Earn auto-dismiss ~2.5s (reduced motion ~1.4s). Redeem auto-dismiss ~3.5s (reduced motion ~1.8s).
- All motion goes through the existing `useMotion()` / `SPRINGS` / `EASES` vocabulary in `frontend/src/lib/motion.ts` — no hand-rolled reduced-motion checks.
- New visual designs only — do not reuse the choreography/markup of the existing `EarnCelebration.tsx` / `RedeemCelebration.tsx` (they get deleted in Task 7).
- Redemption status tracking (redeemed/pending/canceled, synced to outlet admin) is explicitly out of scope for this plan.

---

### Task 1: Celebration context, portal, and TenantScope wiring

**Files:**
- Create: `frontend/src/context/CelebrationContext.tsx`
- Create: `frontend/src/components/customer/celebration/CelebrationOverlay.tsx`
- Modify: `frontend/src/App.tsx:90-97` (`TenantScope`)

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 4, 5, 6):
  - `export interface EarnCelebrationData { points: number; billAmount: number; balance: number; outletName?: string; multiplier?: number; campaignName?: string | null; }`
  - `export interface RedeemCelebrationData { points: number; rewardName: string; balance: number; balanceBefore?: number; }`
  - `export function useCelebration(): { showEarn: (data: EarnCelebrationData) => void; showRedeem: (data: RedeemCelebrationData) => void }`
  - `export function CelebrationProvider({ children }: { children: ReactNode }): JSX.Element`
  - `export function CelebrationOverlay({ children }: { children: ReactNode }): JSX.Element` (portals `children` to `document.body`, applies the blur/dim scrim, fades in/out — used internally by `CelebrationProvider`, and directly by Task 2/3 for manual preview if needed)

- [ ] **Step 1: Create the overlay wrapper**

`frontend/src/components/customer/celebration/CelebrationOverlay.tsx`:

```tsx
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useMotion } from "../../../lib/motion";

// Portals to document.body so this sits above whatever route is mounted
// underneath (the real dashboard), rather than being clipped by any
// scrolling/overflow ancestor in the current route's markup.
export function CelebrationOverlay({ children }: { children: ReactNode }) {
  const m = useMotion();

  return createPortal(
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={m.ease("ui")}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        background: "rgba(10,10,10,0.35)",
      }}
    >
      <motion.div
        initial={m.pick({ opacity: 0, scale: 0.96 }, { opacity: 0 })}
        animate={{ opacity: 1, scale: 1 }}
        exit={m.pick({ opacity: 0, scale: 0.96 }, { opacity: 0 })}
        transition={m.spring("settle")}
        className="w-full max-w-sm"
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default CelebrationOverlay;
```

- [ ] **Step 2: Create the context/provider**

`frontend/src/context/CelebrationContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, useReducedMotion } from "motion/react";

import { CelebrationOverlay } from "../components/customer/celebration/CelebrationOverlay";
import { EarnBurst } from "../components/customer/celebration/EarnBurst";
import { RedeemVoucher } from "../components/customer/celebration/RedeemVoucher";

export interface EarnCelebrationData {
  points: number;
  billAmount: number;
  balance: number;
  outletName?: string;
  multiplier?: number;
  campaignName?: string | null;
}

export interface RedeemCelebrationData {
  points: number;
  rewardName: string;
  balance: number;
  balanceBefore?: number;
}

type CelebrationState =
  | { kind: "earn"; data: EarnCelebrationData }
  | { kind: "redeem"; data: RedeemCelebrationData }
  | null;

// Long enough to read the figure, short enough not to block the customer
// from the dashboard that's already loaded underneath. Redeem gets longer
// than earn because it carries a reward name, not just a number.
const EARN_MS = 2500;
const EARN_MS_REDUCED = 1400;
const REDEEM_MS = 3500;
const REDEEM_MS_REDUCED = 1800;

interface CelebrationContextValue {
  showEarn: (data: EarnCelebrationData) => void;
  showRedeem: (data: RedeemCelebrationData) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [celebration, setCelebration] = useState<CelebrationState>(null);
  const prefersReduced = useReducedMotion() ?? false;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const showEarn = useCallback(
    (data: EarnCelebrationData) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCelebration({ kind: "earn", data });
      timerRef.current = setTimeout(
        () => setCelebration(null),
        prefersReduced ? EARN_MS_REDUCED : EARN_MS,
      );
    },
    [prefersReduced],
  );

  const showRedeem = useCallback(
    (data: RedeemCelebrationData) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCelebration({ kind: "redeem", data });
      timerRef.current = setTimeout(
        () => setCelebration(null),
        prefersReduced ? REDEEM_MS_REDUCED : REDEEM_MS,
      );
    },
    [prefersReduced],
  );

  return (
    <CelebrationContext.Provider value={{ showEarn, showRedeem }}>
      {children}
      <AnimatePresence>
        {celebration && (
          <CelebrationOverlay key={celebration.kind}>
            {celebration.kind === "earn" ? (
              <EarnBurst data={celebration.data} />
            ) : (
              <RedeemVoucher data={celebration.data} />
            )}
          </CelebrationOverlay>
        )}
      </AnimatePresence>
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error("useCelebration must be used within CelebrationProvider");
  return ctx;
}
```

This references `EarnBurst` and `RedeemVoucher`, which don't exist yet — that's expected, they're built in Tasks 2 and 3. The app won't type-check until then; that's fine within this task sequence.

- [ ] **Step 3: Wire the provider into `TenantScope`**

In `frontend/src/App.tsx`, add the import near the other context imports (around line 9):

```tsx
import { CelebrationProvider } from './context/CelebrationContext';
```

Then change `TenantScope` (currently lines 90-97):

```tsx
function TenantScope() {
  return (
    <TenantProvider>
      <TenantSessionSync />
      <Outlet />
    </TenantProvider>
  );
}
```

to:

```tsx
function TenantScope() {
  return (
    <TenantProvider>
      <TenantSessionSync />
      <CelebrationProvider>
        <Outlet />
      </CelebrationProvider>
    </TenantProvider>
  );
}
```

`TenantScope` stays mounted across an in-tenant navigation (confirmed by the existing comment in `CustomerLayout.tsx:59-66`), so `CelebrationProvider` — and the overlay it may be showing — survives the `navigate()` from `/claim` or `/redeem` to `/dashboard`.

- [ ] **Step 4: Commit (deferred)**

Do not commit yet — this task references files created in Task 2/3 and won't type-check on its own. Committing happens at the end of Task 3, covering Tasks 1-3 together.

---

### Task 2: `EarnBurst` — new coin/particle burst animation

**Files:**
- Create: `frontend/src/components/customer/celebration/EarnBurst.tsx`
- Modify: `frontend/src/lib/motion.ts:17-26` (add a spring)

**Interfaces:**
- Consumes: `EarnCelebrationData` from `../../../context/CelebrationContext` (Task 1); `useMotion()`, `SPRINGS` from `../../../lib/motion`; `useCountUp` from `../../../hooks/useCountUp`; `formatPoints` from `../../../hooks/usePoints`.
- Produces: `export function EarnBurst({ data }: { data: EarnCelebrationData }): JSX.Element` — consumed by `CelebrationContext.tsx` (Task 1).

- [ ] **Step 1: Add a new spring for the burst**

In `frontend/src/lib/motion.ts`, add to the `SPRINGS` object (after `coinPop` at line 21):

```ts
  /** Earn burst: punchier overshoot than coinPop, since particles are flying at the same time. */
  coinBurst: { type: "spring", stiffness: 320, damping: 12 },
```

- [ ] **Step 2: Write `EarnBurst`**

`frontend/src/components/customer/celebration/EarnBurst.tsx`:

```tsx
import { motion } from "motion/react";

import { formatPoints } from "../../../hooks/usePoints";
import { useCountUp } from "../../../hooks/useCountUp";
import { useMotion } from "../../../lib/motion";
import type { EarnCelebrationData } from "../../../context/CelebrationContext";

// Eight particles flung out from the coin at fixed compass angles — evenly
// spaced so the burst reads as a deliberate shape, not random scatter.
const PARTICLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const PARTICLE_DISTANCE = 64;

export function EarnBurst({ data }: { data: EarnCelebrationData }) {
  const m = useMotion();
  const counted = useCountUp(data.points);
  const hasCampaign = (data.multiplier ?? 1) > 1;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-24 w-24 items-center justify-center">
        {/* Particles are pure decoration with no informational content, so
            reduced motion drops them entirely rather than crossfading. */}
        {!m.prefersReduced &&
          PARTICLE_ANGLES.map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const dx = Math.cos(rad) * PARTICLE_DISTANCE;
            const dy = Math.sin(rad) * PARTICLE_DISTANCE;
            return (
              <motion.span
                key={angle}
                initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                animate={{ x: dx, y: dy, opacity: [0, 1, 0], scale: 0.4 }}
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.05 }}
                className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-[var(--primary)]"
              />
            );
          })}

        <motion.div
          initial={m.pick({ scale: 0 }, { opacity: 0 })}
          animate={m.pick({ scale: [0, 1.22, 1] }, { opacity: 1 })}
          transition={m.spring("coinBurst")}
          className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[var(--primary)] shadow-float"
        >
          <span className="font-numeral text-3xl leading-none text-white">Rs</span>
        </motion.div>
      </div>

      <div className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
        Points earned
      </div>

      <div
        className="mt-1 font-numeral font-numeral-lg text-[64px] leading-none text-[var(--primary)]"
        aria-hidden="true"
      >
        +{formatPoints(counted)}
      </div>
      <span className="sr-only" aria-live="polite">
        Earned {formatPoints(data.points)} points
        {data.outletName ? ` at ${data.outletName}` : ""}
      </span>

      {/* A doubled number with no explanation reads as a bug. */}
      {hasCampaign && (
        <motion.div
          initial={m.pick({ opacity: 0, scale: 0.9 }, { opacity: 0 })}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.35 }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-bold text-white"
        >
          {data.multiplier}× — {data.campaignName || "campaign"}
        </motion.div>
      )}

      {data.outletName && (
        <motion.p
          initial={m.pick({ opacity: 0, y: 10 }, { opacity: 0 })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.45 }}
          className="mt-4 text-sm text-[var(--muted)]"
        >
          at {data.outletName}
        </motion.p>
      )}
    </div>
  );
}

export default EarnBurst;
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run lint`
Expected: still fails, because `RedeemVoucher` (Task 3) doesn't exist yet — confirm the *only* remaining error mentions `RedeemVoucher`/`./RedeemVoucher`, not `EarnBurst`.

---

### Task 3: `RedeemVoucher` — new ticket/voucher reveal animation

**Files:**
- Create: `frontend/src/components/customer/celebration/RedeemVoucher.tsx`
- Modify: `frontend/src/lib/motion.ts:17-26` (add a spring)

**Interfaces:**
- Consumes: `RedeemCelebrationData` from `../../../context/CelebrationContext` (Task 1); `useMotion()` from `../../../lib/motion`; `useCountUp` from `../../../hooks/useCountUp`; `formatPoints` from `../../../hooks/usePoints`.
- Produces: `export function RedeemVoucher({ data }: { data: RedeemCelebrationData }): JSX.Element` — consumed by `CelebrationContext.tsx` (Task 1).

- [ ] **Step 1: Add a new spring for the voucher pop-in**

In `frontend/src/lib/motion.ts`, add to `SPRINGS` (after the `coinBurst` entry added in Task 2):

```ts
  /** Redeem: ticket pops up and settles — no rotation, unlike the old flip. */
  ticketPop: { type: "spring", stiffness: 300, damping: 20 },
```

- [ ] **Step 2: Write `RedeemVoucher`**

`frontend/src/components/customer/celebration/RedeemVoucher.tsx`:

```tsx
import { motion } from "motion/react";
import { Ticket } from "lucide-react";

import { formatPoints } from "../../../hooks/usePoints";
import { useCountUp } from "../../../hooks/useCountUp";
import { useMotion } from "../../../lib/motion";
import type { RedeemCelebrationData } from "../../../context/CelebrationContext";

// "The ticket." A voucher card pops up from below and settles, with a light
// sweep across it once, then the balance ticks down beneath it. Deliberately
// no rotateY flip (that was the old design) — this rises and lands instead.
export function RedeemVoucher({ data }: { data: RedeemCelebrationData }) {
  const m = useMotion();
  const counted = useCountUp(data.balance, { from: data.balanceBefore ?? data.balance });

  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={m.pick({ scale: 0.6, y: 24, opacity: 0 }, { opacity: 0 })}
        animate={m.pick({ scale: 1, y: 0, opacity: 1 }, { opacity: 1 })}
        transition={m.spring("ticketPop")}
        className="relative w-[260px] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] px-6 py-7 text-center shadow-ambient"
      >
        {/* Notch cutouts read as a ticket edge, not a plain card. */}
        <span className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-[var(--bg)]" />
        <span className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-[var(--bg)]" />

        {!m.prefersReduced && (
          <motion.span
            initial={{ x: "-120%" }}
            animate={{ x: "220%" }}
            transition={{ duration: 0.9, ease: "easeInOut", delay: 0.25 }}
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        )}

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)]">
          <Ticket className="h-6 w-6 text-[var(--primary-deep)]" strokeWidth={1.75} />
        </div>

        <h2 className="mt-5 font-display text-xl font-bold text-[var(--ink)]">Reward unlocked</h2>

        <p className="mt-1 font-display text-lg font-bold text-[var(--primary-deep)]">
          {data.rewardName}
        </p>

        <div className="mt-4 border-t border-dashed border-[var(--line)] pt-4">
          <p className="text-sm text-[var(--muted)]">{formatPoints(data.points)} points redeemed</p>
        </div>
      </motion.div>

      <motion.div
        initial={m.pick({ opacity: 0, y: 14 }, { opacity: 0 })}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...m.spring("settle"), delay: m.prefersReduced ? 0 : 0.3 }}
        className="mt-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5 text-center shadow-ambient"
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          Remaining balance
        </div>
        <p className="mt-1.5 font-numeral text-4xl leading-none text-[var(--ink)]" aria-hidden="true">
          {formatPoints(counted)}
        </p>
        <span className="sr-only" aria-live="polite">
          {data.rewardName} redeemed for {formatPoints(data.points)} points. Remaining balance{" "}
          {formatPoints(data.balance)}.
        </span>
      </motion.div>
    </div>
  );
}

export default RedeemVoucher;
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS (no errors) — Tasks 1-3 together form a complete, self-consistent unit now.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/CelebrationContext.tsx frontend/src/components/customer/celebration/CelebrationOverlay.tsx frontend/src/components/customer/celebration/EarnBurst.tsx frontend/src/components/customer/celebration/RedeemVoucher.tsx frontend/src/lib/motion.ts frontend/src/App.tsx
git commit -m "feat(celebration): add overlay-based earn/redeem animation system

New CelebrationProvider portals a blurred, auto-vanishing overlay above
whatever route is mounted underneath. EarnBurst and RedeemVoucher are new
animations, not reused from the old full-takeover components."
```

---

### Task 4: Wire `ClaimLanding` to the new celebration flow

**Files:**
- Modify: `frontend/src/routes/ClaimLanding.tsx`

**Interfaces:**
- Consumes: `useCelebration` from `../context/CelebrationContext` (Task 1).

- [ ] **Step 1: Swap the import**

In `frontend/src/routes/ClaimLanding.tsx:8`, replace:

```tsx
import { EarnCelebration } from "../components/customer/EarnCelebration";
```

with:

```tsx
import { useCelebration } from "../context/CelebrationContext";
```

- [ ] **Step 2: Grab `showEarn` in the component**

After the existing hooks destructure (`ClaimLanding.tsx:86-87`):

```tsx
  const { tenant } = useTenant();
  const { user, isLoading, ensureTenantSession, login, registerUser, loginWithGoogle } = useCustomerAuth();
```

add:

```tsx
  const { showEarn } = useCelebration();
```

- [ ] **Step 3: Trigger the celebration in `checkStatus`'s fulfilled branch**

In the `checkStatus` function (`ClaimLanding.tsx:139-164`), the fulfilled branch currently reads:

```tsx
      if (res.data.fulfilled) {
        setResult({
          pointsEarned: res.data.pointsEarned ?? 0,
          billAmount: res.data.billAmount ?? 0,
          balance: res.data.balance ?? 0,
          multiplier: res.data.multiplier,
          campaignName: res.data.campaignName,
        });
        setStage("success");
        return true;
      }
```

Change it to:

```tsx
      if (res.data.fulfilled) {
        setResult({
          pointsEarned: res.data.pointsEarned ?? 0,
          billAmount: res.data.billAmount ?? 0,
          balance: res.data.balance ?? 0,
          multiplier: res.data.multiplier,
          campaignName: res.data.campaignName,
        });
        showEarn({
          points: res.data.pointsEarned ?? 0,
          billAmount: res.data.billAmount ?? 0,
          balance: res.data.balance ?? 0,
          outletName: tenant?.name,
          multiplier: res.data.multiplier,
          campaignName: res.data.campaignName,
        });
        setStage("success");
        navigate(tenantPath(companySlug, slug, "dashboard"));
        return true;
      }
```

- [ ] **Step 4: Trigger the celebration in `fulfill`'s success path**

In the `fulfill` function (`ClaimLanding.tsx:168-207`), currently:

```tsx
      const res = await apiRequest<{ success: boolean; data: ClaimResult }>(
        `/api/claim/${claimId}/fulfill`,
        { method: "POST", body: { claimSecret } },
      );
      setResult(res.data);
      setStage("success");
```

Change to:

```tsx
      const res = await apiRequest<{ success: boolean; data: ClaimResult }>(
        `/api/claim/${claimId}/fulfill`,
        { method: "POST", body: { claimSecret } },
      );
      setResult(res.data);
      showEarn({
        points: res.data.pointsEarned,
        billAmount: res.data.billAmount,
        balance: res.data.balance,
        outletName: tenant?.name,
        multiplier: res.data.multiplier,
        campaignName: res.data.campaignName,
      });
      setStage("success");
      navigate(tenantPath(companySlug, slug, "dashboard"));
```

- [ ] **Step 5: Replace the `EarnCelebration` render branch**

Replace the block at `ClaimLanding.tsx:410-423`:

```tsx
  if (stage === "success" && result) {
    return (
      <EarnCelebration
        points={result.pointsEarned}
        billAmount={result.billAmount}
        balance={result.balance}
        outletName={tenant?.name}
        multiplier={result.multiplier}
        campaignName={result.campaignName}
        onDone={() => navigate(tenantPath(companySlug, slug, "dashboard"))}
        doneLabel="Go to dashboard"
      />
    );
  }
```

with:

```tsx
  // Both writers of stage "success" (checkStatus, fulfill) already called
  // showEarn() and navigate() — this is just the one-frame guard against
  // rendering the "choose" screen while that navigation is committing.
  if (stage === "success") {
    return null;
  }
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/ClaimLanding.tsx
git commit -m "feat(claim): show new overlay celebration instead of full-takeover screen"
```

---

### Task 5: Wire `RedeemLanding` to the new celebration flow

**Files:**
- Modify: `frontend/src/routes/RedeemLanding.tsx`

**Interfaces:**
- Consumes: `useCelebration` from `../context/CelebrationContext` (Task 1).

- [ ] **Step 1: Swap the import**

In `frontend/src/routes/RedeemLanding.tsx:11`, replace:

```tsx
import { RedeemCelebration } from "../components/customer/RedeemCelebration";
```

with:

```tsx
import { useCelebration } from "../context/CelebrationContext";
```

- [ ] **Step 2: Grab `showRedeem`, drop the now-unused `result` state**

Replace (`RedeemLanding.tsx:52-54`):

```tsx
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingReward | null>(null);
  const [result, setResult] = useState<RedeemResult["data"] | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
```

with:

```tsx
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingReward | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const { showRedeem } = useCelebration();
```

(`result` is dropped entirely — nothing outside the old render branch read it.)

- [ ] **Step 3: Trigger the celebration in `redeem()`**

Replace (`RedeemLanding.tsx:82-106`):

```tsx
  const redeem = async (itemId: string) => {
    setRedeeming(itemId);
    try {
      const res = await apiRequest<RedeemResult>("/api/points/redeem", {
        method: "POST",
        body: { token, itemId },
      });
      setResult(res.data);
      setPending(null);
      qc.invalidateQueries({ queryKey: ["pointsBalance"] });
      qc.invalidateQueries({ queryKey: ["pointsHistory"] });
    } catch (err: any) {
```

with:

```tsx
  const redeem = async (itemId: string) => {
    setRedeeming(itemId);
    try {
      const res = await apiRequest<RedeemResult>("/api/points/redeem", {
        method: "POST",
        body: { token, itemId },
      });
      setPending(null);
      qc.invalidateQueries({ queryKey: ["pointsBalance"] });
      qc.invalidateQueries({ queryKey: ["pointsHistory"] });
      showRedeem({
        points: res.data.pointsSpent,
        rewardName: res.data.rewardName,
        balance: res.data.balance,
        // Derived, not read from the balance query: that query is invalidated
        // by the redemption, so reading it here would race the refetch and
        // sometimes tick down from the figure we're already showing.
        balanceBefore: res.data.balance + res.data.pointsSpent,
      });
      navigate(tenantPath(companySlug, outletSlug, "dashboard"));
    } catch (err: any) {
```

- [ ] **Step 4: Remove the `RedeemCelebration` render branch**

Delete the block at `RedeemLanding.tsx:151-165`:

```tsx
  if (result) {
    return (
      <RedeemCelebration
        points={result.pointsSpent}
        rewardName={result.rewardName}
        balance={result.balance}
        // Derived, not read from the balance query: that query is invalidated
        // by the redemption, so reading it here would race the refetch and
        // sometimes tick down from the figure we're already showing.
        balanceBefore={result.balance + result.pointsSpent}
        onDone={() => navigate(tenantPath(companySlug, outletSlug, "dashboard"))}
        doneLabel="Back to my points"
      />
    );
  }

```

(No replacement needed — `redeem()` now navigates away directly, so this branch is unreachable and can simply be deleted.)

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/RedeemLanding.tsx
git commit -m "feat(redeem): show new overlay celebration instead of full-takeover screen"
```

---

### Task 6: Wire `ScannerModal` to the new celebration flow

**Files:**
- Modify: `frontend/src/components/customer/ScannerModal.tsx`

**Interfaces:**
- Consumes: `useCelebration` from `../../context/CelebrationContext` (Task 1); `tenantPath` from `../../lib/tenantPath` (already imported).

- [ ] **Step 1: Swap the import, drop the `earned` state**

Replace (`ScannerModal.tsx:9`):

```tsx
import { EarnCelebration } from "./EarnCelebration";
```

with:

```tsx
import { useCelebration } from "../../context/CelebrationContext";
```

Replace (`ScannerModal.tsx:37`):

```tsx
  const [earned, setEarned] = useState<EarnResult | null>(null);
```

with nothing — delete the line. Then add, alongside the other hooks near the top of the component (`ScannerModal.tsx:32-35`):

```tsx
  const { companySlug } = useTenant();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showEarn } = useCelebration();
```

- [ ] **Step 2: Update the `open` effect's reset block**

In the `useEffect` at `ScannerModal.tsx:42-49`, remove the `setEarned(null)` call:

```tsx
  useEffect(() => {
    if (!open) {
      setCameraError(null);
      setIsBlocked(false);
      setPendingToken(null);
      return;
    }
```

- [ ] **Step 3: Trigger the celebration in `claimToken`, and close/navigate instead of rendering**

Replace (`ScannerModal.tsx:91-121`):

```tsx
  const claimToken = async (rawToken: string) => {
    const toastId = toast.loading("Adding your points…");
    try {
      const response = await apiRequest<{
        success: boolean;
        message: string;
        data?: EarnResult;
      }>("/api/points/claim", {
        method: "POST",
        body: { token: rawToken },
      });

      if (response.success && response.data) {
        queryClient.invalidateQueries({ queryKey: ["pointsBalance"] });
        queryClient.invalidateQueries({ queryKey: ["pointsHistory"] });
        toast.dismiss(toastId);
        setEarned(response.data);
      } else {
        throw new Error(response.message || "Couldn't add those points — try again.");
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "PHONE_REQUIRED") {
        toast.dismiss(toastId);
        setPendingToken(rawToken);
        return;
      }
      toast.error((err as Error).message || "Couldn't add those points — try again.", { id: toastId });
      onClose();
    }
  };
```

with:

```tsx
  const claimToken = async (rawToken: string) => {
    const toastId = toast.loading("Adding your points…");
    try {
      const response = await apiRequest<{
        success: boolean;
        message: string;
        data?: EarnResult;
      }>("/api/points/claim", {
        method: "POST",
        body: { token: rawToken },
      });

      if (response.success && response.data) {
        queryClient.invalidateQueries({ queryKey: ["pointsBalance"] });
        queryClient.invalidateQueries({ queryKey: ["pointsHistory"] });
        toast.dismiss(toastId);
        showEarn({
          points: response.data.pointsEarned,
          billAmount: response.data.billAmount,
          balance: response.data.balance,
          outletName: tenantName,
          multiplier: response.data.multiplier,
          campaignName: response.data.campaignName,
        });
        onClose();
        navigate(tenantPath(companySlug, slug, "dashboard"));
      } else {
        throw new Error(response.message || "Couldn't add those points — try again.");
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "PHONE_REQUIRED") {
        toast.dismiss(toastId);
        setPendingToken(rawToken);
        return;
      }
      toast.error((err as Error).message || "Couldn't add those points — try again.", { id: toastId });
      onClose();
    }
  };
```

- [ ] **Step 4: Drop `earned` from the scan-active guard and effect dependencies**

Replace (`ScannerModal.tsx:134`):

```tsx
    if (!earned && !cameraError && !pendingToken) {
```

with:

```tsx
    if (!cameraError && !pendingToken) {
```

Replace the dependency array (`ScannerModal.tsx:230`):

```tsx
  }, [open, onClose, queryClient, navigate, companySlug, slug, earned, cameraError, pendingToken]);
```

with:

```tsx
  }, [open, onClose, queryClient, navigate, companySlug, slug, cameraError, pendingToken]);
```

(The scanner effect still tears down correctly on success: `claimToken` now calls `onClose()` directly, which flips the parent's `open` prop to `false`, running the existing cleanup path.)

- [ ] **Step 5: Remove `handleGoToHistory` and the `EarnCelebration` render branch**

Delete `handleGoToHistory` (`ScannerModal.tsx:237-240`):

```tsx
  const handleGoToHistory = () => {
    onClose();
    navigate(tenantPath(companySlug, slug, "history"));
  };

```

Delete the render branch (`ScannerModal.tsx:256-270`):

```tsx
  if (earned) {
    return (
      <EarnCelebration
        points={earned.pointsEarned}
        billAmount={earned.billAmount}
        balance={earned.balance}
        outletName={tenantName}
        multiplier={earned.multiplier}
        campaignName={earned.campaignName}
        onDone={onClose}
        doneLabel="Done"
        onSecondary={handleGoToHistory}
        secondaryLabel="See my history"
      />
    );
  }

```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/customer/ScannerModal.tsx
git commit -m "feat(scanner): show new overlay celebration and navigate to dashboard on earn"
```

---

### Task 7: Delete obsolete components and verify end-to-end

**Files:**
- Delete: `frontend/src/components/customer/EarnCelebration.tsx`
- Delete: `frontend/src/components/customer/RedeemCelebration.tsx`

**Interfaces:** None — this task only removes dead code and verifies the result.

- [ ] **Step 1: Confirm nothing else references the old components**

Run: `cd frontend && grep -rn "EarnCelebration\|RedeemCelebration" src`
Expected: no matches (Tasks 4, 5, 6 already removed every import/usage).

- [ ] **Step 2: Delete the old files**

```bash
git rm frontend/src/components/customer/EarnCelebration.tsx frontend/src/components/customer/RedeemCelebration.tsx
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual verification in the dev server**

Start the frontend dev server (`cd frontend && npm run dev`) against a running backend with seeded demo data, then for each of the 3 flows confirm:

1. **Claim link** (`/:company/:outlet/claim?token=...`): scan/open a valid claim link while signed in → overlay appears with the blurred `CustomerDashboard` visible behind it, coin/particle burst plays, no button is present, it fades out on its own after ~2.5s, and the (now fully loaded) dashboard is left showing the updated balance.
2. **In-app scanner** (`ScannerModal`, opened from the dashboard's "Scan" button): scan a valid earn QR → modal closes, overlay plays over the dashboard the same way as above, auto-vanishes, no "Done"/"See my history" buttons.
3. **Redeem** (`/:company/:outlet/redeem?token=...`): pick a reward and confirm → voucher-reveal overlay plays over the blurred dashboard, shows the reward name and points redeemed, no button, auto-vanishes after ~3.5s.
4. **Reduced motion**: enable "reduce motion" in OS accessibility settings (or override `prefers-reduced-motion` via browser devtools rendering panel), repeat flow 1 → burst/shine/particle motion is skipped, the overlay still appears and auto-dismisses (on the shorter ~1.4s timer), no layout breakage.
5. **Mobile width**: resize to ~375px wide, repeat flow 1 → overlay and card are fully visible, not clipped, text doesn't overflow.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(celebration): remove obsolete full-takeover celebration components"
```
