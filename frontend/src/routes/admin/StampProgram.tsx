import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAdminSettings, useUpdateAdminSettings, type AdminProgram } from "../../hooks/useAdminSettings";

export default function StampProgram() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [form, setForm] = useState<AdminProgram | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings.program);
  }, [settings, form]);

  if (isLoading || !form) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }

  const set = <K extends keyof AdminProgram>(k: K, v: AdminProgram[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    try {
      await update.mutateAsync({ program: form });
      toast.success("Program saved");
    } catch (err) {
      toast.error((err as Error).message || "Failed to save.");
    }
  };

  return (
    <div className="max-w-[620px]">
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Stamp program</h1>
      <p className="mb-6 text-[var(--muted)]">Configure how customers earn their reward.</p>

      <div className="flex flex-col gap-6 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <div>
          <label className="mb-1 block text-sm font-bold">Stamps required per reward</label>
          <p className="mb-2.5 text-[13px] text-[var(--muted)]">Between 2 and 20 stamps.</p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={form.stampsRequired}
              onChange={(e) => set("stampsRequired", Number(e.target.value))}
              className="flex-1"
              style={{ accentColor: "var(--brand)" }}
            />
            <span
              className="flex h-12 w-12 items-center justify-center rounded-[12px] font-display text-lg font-extrabold text-white"
              style={{ background: "var(--brand)" }}
            >
              {form.stampsRequired}
            </span>
          </div>
        </div>

        <div className="border-t border-[var(--line)] pt-5">
          <label className="mb-1.5 block text-sm font-bold">Reward title</label>
          <input
            value={form.rewardTitle}
            onChange={(e) => set("rewardTitle", e.target.value)}
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold">Reward description</label>
          <textarea
            value={form.rewardDescription}
            onChange={(e) => set("rewardDescription", e.target.value)}
            rows={3}
            className="w-full resize-y rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
        </div>

        <div className="border-t border-[var(--line)] pt-5">
          <label className="mb-1.5 block text-sm font-bold">Cooldown between stamps</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              value={form.cooldownHours}
              onChange={(e) => set("cooldownHours", Number(e.target.value))}
              className="w-24 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <span className="text-sm text-[var(--muted)]">hours — stops double-stamping on one visit</span>
          </div>
        </div>

        <button
          onClick={save}
          disabled={update.isPending}
          className="rounded-[13px] py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {update.isPending ? "Saving…" : "Save program"}
        </button>
      </div>
    </div>
  );
}
