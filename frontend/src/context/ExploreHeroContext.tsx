import { createContext, useContext, useState, type ReactNode } from "react";
import { useMotionValue, type MotionValue } from "motion/react";

// Bridges GlobalCustomerLayout's header and OutletCardStack (mounted only on
// the /explore route). heroColor is plain React state — it only changes on a
// discrete swipe/tap, so a header re-render is cheap and correct. progress is
// a single MotionValue driven every scroll frame; reading it via
// useTransform/style means the header never re-renders on scroll. headerHeight
// is the real rendered height of the sticky header, measured by the header
// itself — the card stack needs it so its own sticky collapse zone can pin
// directly below the header rather than guessing a fixed offset.
export interface ExploreHeroContextValue {
  heroColor: string | null;
  setHeroColor: (color: string | null) => void;
  progress: MotionValue<number>;
  headerHeight: number;
  setHeaderHeight: (height: number) => void;
}

const ExploreHeroContext = createContext<ExploreHeroContextValue | null>(null);

export function ExploreHeroProvider({ children }: { children: ReactNode }) {
  const [heroColor, setHeroColor] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(64);
  const progress = useMotionValue(0);

  return (
    <ExploreHeroContext.Provider value={{ heroColor, setHeroColor, progress, headerHeight, setHeaderHeight }}>
      {children}
    </ExploreHeroContext.Provider>
  );
}

export function useExploreHero(): ExploreHeroContextValue {
  const ctx = useContext(ExploreHeroContext);
  if (!ctx) throw new Error("useExploreHero must be used within ExploreHeroProvider");
  return ctx;
}
