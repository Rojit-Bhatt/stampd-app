import React from "react";

interface PunchCardProps {
  stampsEarned: number;
}

const CoffeeCupOutline = ({ className = "w-12 h-12" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 8H7v6a4 4 0 0 0 4 4h2a4 4 0 0 0 4-4V8z" />
    <path d="M17 9h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" />
    <path d="M5 21h14" />
  </svg>
);

const CoffeeCupFilled = ({ className = "w-12 h-12" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 8H7v6a4 4 0 0 0 4 4h2a4 4 0 0 0 4-4V8z" />
    <path d="M17 9h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" />
    <path d="M5 21h14" />
  </svg>
);

export function PunchCard({ stampsEarned }: PunchCardProps) {
  const totalSlots = 5;

  return (
    <div 
      className="mt-5 grid grid-cols-3 gap-4 sm:gap-5" 
      role="list" 
      aria-label={`${stampsEarned} of ${totalSlots} stamps collected`}
    >
      {Array.from({ length: totalSlots }).map((_, i) => {
        const isEarned = i < stampsEarned;
        const index = i + 1;
        return (
          <div key={i} className="flex flex-col items-center gap-1.5" role="listitem">
            <div
              className={`relative grid h-20 w-20 place-items-center rounded-[24px] overflow-hidden border transition-all duration-300 ${
                isEarned
                  ? "bg-[#EBE6DF] border-[#EBE6DF] text-black"
                  : "border-[#2D2D2D] bg-[#1A1A1A]/40"
              }`}
              aria-label={isEarned ? `Stamp ${index} collected` : `Stamp ${index} empty`}
            >
              {isEarned ? (
                <CoffeeCupFilled className="h-9 w-9 text-black" />
              ) : (
                <CoffeeCupOutline className="h-9 w-9 text-[#A3A3A3]/25" />
              )}
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${
                isEarned ? "text-[#EBE6DF]" : "text-[#A3A3A3]"
              }`}
            >
              {isEarned ? "Earned" : `0${index}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
export { CoffeeCupOutline, CoffeeCupFilled };
