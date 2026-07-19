import { useMemo } from "react";

export interface DateRangeValue {
  startDate: string;
  endDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function rangeFor(days: number): DateRangeValue {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

// Trailing windows, not calendar-aligned ones — "last 7 days" rather than
// "this Mon-to-Sun". A calendar week/month would need to pick a first day of
// week and reckon it in a timezone (the rest of the product judges campaign
// days in Nepal time for exactly this reason), which is more than a reports
// filter needs. Trailing windows need no such decision and never surprise
// someone checking on a Tuesday why "this week" only has two days in it.
const PRESETS: { key: string; label: string; range: () => DateRangeValue }[] = [
  { key: "today", label: "Today", range: () => rangeFor(1) },
  { key: "week", label: "Last 7 days", range: () => rangeFor(7) },
  { key: "month", label: "Last 30 days", range: () => rangeFor(30) },
];

/**
 * Quick date-range presets plus a custom start/end. Used anywhere a report
 * is scoped to a window — the two fields are always live and editable, and
 * a preset button is just a shortcut that fills them; editing a field
 * directly is what "Custom" means, so there's no separate custom toggle to
 * get out of sync with what's actually in the fields.
 */
export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}) {
  // Highlight a preset only when the fields exactly match what it would
  // produce right now — so it stops looking selected the moment either
  // field is hand-edited, without needing separate state to track that.
  const activePreset = useMemo(() => {
    for (const p of PRESETS) {
      const r = p.range();
      if (r.startDate === value.startDate && r.endDate === value.endDate) return p.key;
    }
    return null;
  }, [value.startDate, value.endDate]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.range())}
            aria-pressed={activePreset === p.key}
            className={`rounded-full px-3.5 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
              activePreset === p.key
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
            Start date
          </span>
          <input
            type="date"
            value={value.startDate}
            max={value.endDate}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
            End date
          </span>
          <input
            type="date"
            value={value.endDate}
            min={value.startDate}
            max={isoDate(new Date())}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
          />
        </label>
      </div>
    </div>
  );
}

export function defaultDateRange(days = 30): DateRangeValue {
  return rangeFor(days);
}

export default DateRangeFilter;
