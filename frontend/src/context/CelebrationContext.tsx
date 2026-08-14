import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, useReducedMotion } from "motion/react";

import { CelebrationOverlay } from "../components/customer/celebration/CelebrationOverlay";
import { EarnBurst } from "../components/customer/celebration/EarnBurst";
import { RedeemLedger } from "../components/customer/celebration/RedeemLedger";

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
  | { kind: "earn"; id: number; data: EarnCelebrationData }
  | { kind: "redeem"; id: number; data: RedeemCelebrationData }
  | null;

// Distinguishes back-to-back celebrations of the same kind (e.g. two earns
// in a row) so AnimatePresence sees a genuinely new key each time, instead
// of treating the second as an update to the first mid-exit.
let nextCelebrationId = 0;

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
      setCelebration({ kind: "earn", id: nextCelebrationId++, data });
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
      setCelebration({ kind: "redeem", id: nextCelebrationId++, data });
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
      {/* Portalled to document.body so the overlay clears any scrolling or
          overflow ancestor in the route mounted underneath. AnimatePresence
          lives INSIDE the portal, not outside it: it has to see the overlay as
          a direct presence child to know when the exit animation finished, and
          a portal boundary between them can strand the overlay on screen. */}
      {createPortal(
        <AnimatePresence>
          {celebration && (
            <CelebrationOverlay key={`${celebration.kind}-${celebration.id}`}>
              {celebration.kind === "earn" ? (
                <EarnBurst data={celebration.data} />
              ) : (
                <RedeemLedger data={celebration.data} />
              )}
            </CelebrationOverlay>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error("useCelebration must be used within CelebrationProvider");
  return ctx;
}
