import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAdminSettings, useUpdateAdminSettings, type AdminProgram } from "../../hooks/useAdminSettings";
import { Skeleton } from "../../components/ui/skeleton";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";

type Field = keyof AdminProgram;

// Every field here is an override: null means "whatever my company says".
// The UI has to make that visible, because "100" typed in by hand and "100
// inherited from the company" behave differently the day the company changes
// its default — one follows, the other doesn't.
export default function PointsProgram() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [form, setForm] = useState<AdminProgram | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings.program);
  }, [settings, form]);

  if (isLoading || !form || !settings) {
    return (
      <div className="max-w-[620px]">
        <Skeleton className="mb-2 h-7 w-56" />
        <Skeleton className="mb-6 h-4 w-72" />
        <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
          <div>
            <Skeleton className="mb-2.5 h-3.5 w-52" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="border-t border-[var(--line)] pt-5">
            <Skeleton className="mb-1.5 h-3.5 w-28" />
            <Skeleton className="h-11 w-full rounded-[11px]" />
          </div>
          <Skeleton className="h-11 w-full rounded-[13px]" />
        </div>
      </div>
    );
  }

  const defaults = settings.companyProgramDefaults;
  const resolved = settings.programResolved;

  const set = <K extends Field>(k: K, v: AdminProgram[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    try {
      await update.mutateAsync({ program: form });
      toast.success("Program saved!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  // Inherit and override are two explicit, visible states rather than "an
  // empty box means inherit". Emptying a field to go back to inheriting was
  // only discoverable by accident, and it made the difference between null
  // (inherit) and 0 (a real, very different setting — "never expire") rest on
  // whether a box looked empty.
  const inheritRow = (field: Field, label: string, fallback: number) => {
    const isInherited = form[field] === null || form[field] === undefined;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
          {label}
        </span>
        <SegmentedControl
          value={isInherited ? "inherit" : "override"}
          onValueChange={(v) =>
            set(field, v === "inherit" ? null : (defaults ? defaults[field] : fallback))
          }
          aria-label={`${label}: inherit from company or override`}
        >
          <SegmentedControlItem value="inherit">Inherit</SegmentedControlItem>
          <SegmentedControlItem value="override">Override</SegmentedControlItem>
        </SegmentedControl>
      </div>
    );
  };

  return (
    <div className="max-w-[620px]">
      <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Points program</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">
        How much this outlet gives back, and how long it lasts.
      </p>

      <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
        <div>
          {inheritRow("earnPercent", "Earn rate", 100)}
          <div className="mt-3 flex items-center gap-2">
            {form.earnPercent === null || form.earnPercent === undefined ? (
              <div className="flex items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--surface-2)] px-4 py-3">
                <span className="font-numeral text-xl leading-none text-[var(--ink)]">
                  {defaults ? defaults.earnPercent : 100}
                </span>
                <span className="text-xs text-[var(--muted)]">from your company</span>
              </div>
            ) : (
              <input
                type="number"
                min={0}
                step="1"
                value={form.earnPercent}
                onChange={(e) => set("earnPercent", e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-32 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            )}
            <span className="text-sm text-[var(--muted)]">% of the bill returned as points</span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--muted)]">
            {resolved.earnPercent === 100
              ? "Right now: 1 point per Rs 1 spent."
              : `Right now: a Rs 100 bill earns ${Math.round(resolved.earnPercent) / 1} points.`}{" "}
            Below 100 gives fractional points — a Rs 105 bill at 10% earns 10.5.
          </p>
        </div>

        <div className="border-t border-[var(--line)] pt-5">
          {inheritRow("pointsExpiryDays", "Points expiry", 0)}
          <div className="mt-3 flex items-center gap-2">
            {form.pointsExpiryDays === null || form.pointsExpiryDays === undefined ? (
              <div className="flex items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--surface-2)] px-4 py-3">
                <span className="font-numeral text-xl leading-none text-[var(--ink)]">
                  {defaults ? defaults.pointsExpiryDays : 0}
                </span>
                <span className="text-xs text-[var(--muted)]">from your company</span>
              </div>
            ) : (
              <input
                type="number"
                min={0}
                step="1"
                value={form.pointsExpiryDays}
                onChange={(e) => set("pointsExpiryDays", e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-32 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            )}
            <span className="text-sm text-[var(--muted)]">days of inactivity</span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--muted)]">
            {resolved.pointsExpiryDays === 0
              ? "Right now: points never expire."
              : `Right now: a balance expires ${resolved.pointsExpiryDays} days after a customer's last visit.`}{" "}
            The clock restarts on every earn or redeem, so a regular never loses anything. Set 0 to never expire.
          </p>
        </div>

        <Button onClick={save} disabled={update.isPending} size="lg">
          {update.isPending ? "Saving…" : "Save program"}
        </Button>
      </div>

      <p className="mt-4 text-[13px] text-[var(--soft)]">
        Changing the earn rate only affects future visits — what a customer already earned stays as it was.
      </p>
    </div>
  );
}
