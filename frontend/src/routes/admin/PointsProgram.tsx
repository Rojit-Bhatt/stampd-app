import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAdminSettings, useUpdateAdminSettings, type AdminProgram } from "../../hooks/useAdminSettings";
import { Skeleton } from "../../components/ui/skeleton";

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
        <div className="flex flex-col gap-6 shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
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

  // A null override renders as an empty box showing the inherited value as
  // its placeholder — clearing the box is how you go back to inheriting.
  const inheritRow = (field: Field, label: string) => {
    const isInherited = form[field] === null || form[field] === undefined;
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">{label}</span>
        {isInherited ? (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "var(--info-soft)", color: "var(--info)" }}
          >
            Inherited
          </span>
        ) : (
          <button
            onClick={() => set(field, null)}
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider hover:opacity-80"
            style={{ background: "var(--surface-container)", color: "var(--muted)" }}
          >
            Reset to company default
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[620px]">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Points program</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">
        How much this outlet gives back, and how long it lasts.
      </p>

      <div className="flex flex-col gap-6 shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
        <div>
          {inheritRow("earnPercent", "Earn rate")}
          <label className="mt-2 block">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="1"
                value={form.earnPercent ?? ""}
                onChange={(e) => set("earnPercent", e.target.value === "" ? null : Number(e.target.value))}
                placeholder={defaults ? String(defaults.earnPercent) : "100"}
                className="w-32 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
              />
              <span className="text-sm text-[var(--muted)]">% of the bill returned as points</span>
            </div>
          </label>
          <p className="mt-2 text-[13px] text-[var(--muted)]">
            {resolved.earnPercent === 100
              ? "Right now: 1 point per Rs 1 spent."
              : `Right now: a Rs 100 bill earns ${Math.round(resolved.earnPercent) / 1} points.`}{" "}
            Below 100 gives fractional points — a Rs 105 bill at 10% earns 10.5.
          </p>
        </div>

        <div className="border-t border-[var(--line)] pt-5">
          {inheritRow("pointsExpiryDays", "Points expiry")}
          <label className="mt-2 block">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="1"
                value={form.pointsExpiryDays ?? ""}
                onChange={(e) => set("pointsExpiryDays", e.target.value === "" ? null : Number(e.target.value))}
                placeholder={defaults ? String(defaults.pointsExpiryDays) : "0"}
                className="w-32 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
              />
              <span className="text-sm text-[var(--muted)]">days of inactivity</span>
            </div>
          </label>
          <p className="mt-2 text-[13px] text-[var(--muted)]">
            {resolved.pointsExpiryDays === 0
              ? "Right now: points never expire."
              : `Right now: a balance expires ${resolved.pointsExpiryDays} days after a customer's last visit.`}{" "}
            The clock restarts on every earn or redeem, so a regular never loses anything. Set 0 to never expire.
          </p>
        </div>

        <button
          onClick={save}
          disabled={update.isPending}
          className="stamp-interactive rounded-[13px] py-3.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {update.isPending ? "Saving…" : "Save program"}
        </button>
      </div>

      <p className="mt-4 text-[13px] text-[var(--soft)]">
        Changing the earn rate only affects future visits — what a customer already earned stays as it was.
      </p>
    </div>
  );
}
