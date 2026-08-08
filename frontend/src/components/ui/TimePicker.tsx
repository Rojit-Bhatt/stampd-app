import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

// A themed hour/minute/AM-PM picker for a field that's stored (and shown to
// customers) as a plain display string like "7:00 PM" — see
// EventFormModal/EventCard. No native <input type="time"> here: that control
// can't be restyled to match the dark dialog it lives in, and its 24-hour
// wheel doesn't match the "7:00 PM" strings already on file.
interface TimePickerProps {
  value: string; // "7:00 PM" or ""
  onChange: (value: string) => void;
  placeholder?: string;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

function parseValue(value: string): { hour: number; minute: string; period: "AM" | "PM" } | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  return { hour: Number(m[1]), minute: m[2], period: m[3].toUpperCase() as "AM" | "PM" };
}

export function TimePicker({ value, onChange, placeholder = "Time" }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const parsed = parseValue(value);
  const [hour, setHour] = useState(parsed?.hour ?? 7);
  const [minute, setMinute] = useState(parsed?.minute ?? "00");
  const [period, setPeriod] = useState<"AM" | "PM">(parsed?.period ?? "PM");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const commit = (h: number, m: string, p: "AM" | "PM") => {
    onChange(`${h}:${m} ${p}`);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-left text-sm focus:border-[var(--primary)] focus:outline-none"
      >
        <Clock className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
        <span className={value ? "text-[var(--ink)]" : "text-[var(--soft)]"}>{value || placeholder}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 flex gap-1 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-float">
          <div className="max-h-40 w-14 overflow-y-auto">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setHour(h);
                  commit(h, minute, period);
                }}
                className="w-full rounded-[8px] px-2 py-1.5 text-center text-sm"
                style={h === hour ? { background: "var(--primary)", color: "#fff" } : undefined}
              >
                {h}
              </button>
            ))}
          </div>
          <div className="w-14">
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMinute(m);
                  commit(hour, m, period);
                }}
                className="w-full rounded-[8px] px-2 py-1.5 text-center text-sm"
                style={m === minute ? { background: "var(--primary)", color: "#fff" } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex w-12 flex-col gap-1">
            {(["AM", "PM"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPeriod(p);
                  commit(hour, minute, p);
                }}
                className="rounded-[8px] px-2 py-1.5 text-center text-xs font-bold"
                style={p === period ? { background: "var(--primary)", color: "#fff" } : undefined}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
