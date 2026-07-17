import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  useAdminSettings,
  useUpdateAdminSettings,
  BUSINESS_CATEGORIES,
  type AdminBranding,
  type BusinessCategory,
} from "../../hooks/useAdminSettings";
import { Skeleton } from "../../components/ui/skeleton";

const SWATCHES = ["#B5533C", "#8B2635", "#7A5CA8", "#2F7E8C", "#C9852B", "#C24B7A", "#3F7A5C", "#2B2B2B"];

const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  bakery: "Bakery",
  salon: "Salon",
  gym: "Gym",
  retail: "Retail",
  other: "Other",
};

function darken(hex: string, amount = 0.22): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#8a3a28";
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default function Branding() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BusinessCategory>("other");
  const [brand, setBrand] = useState<AdminBranding | null>(null);

  useEffect(() => {
    if (settings && !brand) {
      setName(settings.name);
      setCategory(settings.category);
      setBrand(settings.branding);
    }
  }, [settings, brand]);

  if (isLoading || !brand) {
    return (
      <div>
        <Skeleton className="mb-2 h-7 w-36" />
        <Skeleton className="mb-6 h-4 w-96" />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5 shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-28" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-16" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
            <div>
              <Skeleton className="mb-2 h-3.5 w-24" />
              <div className="flex flex-wrap gap-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-10 rounded-[12px]" />
                ))}
              </div>
            </div>
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-20" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
            <div>
              <Skeleton className="mb-1.5 h-3.5 w-24" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
            <Skeleton className="h-11 w-full rounded-[13px]" />
          </div>
          <Skeleton className="h-[280px] w-full rounded-[28px]" />
        </div>
      </div>
    );
  }

  const set = <K extends keyof AdminBranding>(k: K, v: AdminBranding[K]) =>
    setBrand((b) => (b ? { ...b, [k]: v } : b));

  const save = async () => {
    try {
      await update.mutateAsync({ name, category, branding: brand });
      toast.success("Branding saved!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const initial = (name || "?").charAt(0).toUpperCase();
  const deep = darken(brand.primaryColor);

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Branding</h1>
      <p className="mb-6 text-[var(--muted)]">
        White-label your customer app. Changes preview live on the right.
      </p>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5 shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
          <Field label="Business name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BusinessCategory)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            >
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tagline">
            <input
              value={brand.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>

          <div>
            <div className="mb-2 text-sm font-bold">Brand colour</div>
            <div className="flex flex-wrap items-center gap-2.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => set("primaryColor", c)}
                  className="h-10 w-10 rounded-[12px]"
                  style={{
                    background: c,
                    boxShadow: c === brand.primaryColor ? "0 0 0 3px var(--ink)" : "none",
                  }}
                  aria-label={`Use ${c}`}
                />
              ))}
              <input
                type="color"
                value={brand.primaryColor}
                onChange={(e) => set("primaryColor", e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-[12px] border border-[var(--line)] bg-transparent"
                aria-label="Custom colour"
              />
            </div>
          </div>

          <Field label="Logo URL">
            <input
              value={brand.logoUrl}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder="https://…/logo.png"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="Banner URL">
            <input
              value={brand.bannerUrl}
              onChange={(e) => set("bannerUrl", e.target.value)}
              placeholder="https://…/banner.jpg"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>

          <button
            onClick={save}
            disabled={update.isPending}
            className="rounded-[13px] py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {update.isPending ? "Saving…" : "Save branding"}
          </button>
        </div>

        {/* Live preview */}
        <div className="sticky top-5">
          <div className="mb-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
            Live preview
          </div>
          <div className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-white shadow-lg">
            <div
              className="flex h-[120px] items-end p-4"
              style={
                brand.bannerUrl
                  ? { backgroundImage: `url(${brand.bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : { background: `linear-gradient(150deg, ${brand.primaryColor}, ${deep})` }
              }
            >
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt="" className="h-[50px] w-[50px] rounded-[15px] bg-white object-cover" />
              ) : (
                <div
                  className="flex h-[50px] w-[50px] items-center justify-center rounded-[15px] bg-white font-display text-lg font-extrabold"
                  style={{ color: brand.primaryColor }}
                >
                  {initial}
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="font-display text-[19px] font-extrabold text-[var(--ink)]">{name}</div>
              <div className="mb-3 text-xs text-[var(--muted)]">{brand.tagline}</div>
              <div
                className="rounded-[14px] p-3.5 text-white"
                style={{ background: `linear-gradient(150deg, ${brand.primaryColor}, ${deep})` }}
              >
                <div className="text-[11px] opacity-80">Points balance</div>
                <div className="mb-1 font-display text-2xl font-extrabold">1,240</div>
                <div className="text-[11px] opacity-80">
                  {settings?.programResolved?.earnPercent === 100
                    ? "1 point per Rs 1"
                    : `${settings?.programResolved?.earnPercent ?? 100}% back`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold">{label}</label>
      {children}
    </div>
  );
}
