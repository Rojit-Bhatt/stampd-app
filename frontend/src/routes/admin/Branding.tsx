import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import {
  useAdminSettings,
  useUpdateAdminSettings,
  BUSINESS_CATEGORIES,
  type AdminBranding,
  type BusinessCategory,
} from "../../hooks/useAdminSettings";
import { Skeleton } from "../../components/ui/skeleton";
import { darken, identityAccent, collidesWithValueGreen } from "../../lib/color";

async function resizeImageToBase64(file: File, width: number, height: number, mode: "square" | "aspect"): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image.");

    if (mode === "square") {
      const edge = Math.min(bitmap.width, bitmap.height);
      const sx = (bitmap.width - edge) / 2;
      const sy = (bitmap.height - edge) / 2;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, width, height);
    } else {
      const targetRatio = width / height;
      const srcRatio = bitmap.width / bitmap.height;
      let sx = 0, sy = 0, sWidth = bitmap.width, sHeight = bitmap.height;

      if (srcRatio > targetRatio) {
        sWidth = bitmap.height * targetRatio;
        sx = (bitmap.width - sWidth) / 2;
      } else {
        sHeight = bitmap.width / targetRatio;
        sy = (bitmap.height - sHeight) / 2;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, width, height);
    }

    return canvas.toDataURL("image/webp", 0.85);
  } finally {
    bitmap.close();
  }
}

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

export default function Branding() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BusinessCategory>("other");
  const [brand, setBrand] = useState<AdminBranding | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

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
          <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
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
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Branding</h1>
      <p className="mb-6 text-[var(--muted)]">
        White-label your customer app. Changes preview live on the right.
      </p>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
          <Field label="Business name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BusinessCategory)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
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
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
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

            {/* Told up front, not discovered later. Green already means
                "points" everywhere in the customer app, so a green brand
                colour would make an identity accent read as a balance. Your
                logo and name keep the colour either way. */}
            {collidesWithValueGreen(brand.primaryColor) && (
              <p className="mt-2.5 rounded-[var(--radius-btn)] bg-[var(--warn-soft)] px-3.5 py-2.5 text-[13px] text-[var(--warn)]">
                This green is close to the one Stampd uses for points. Your logo and name will
                still use it, but accents step aside to dark ink so customers can always tell
                their balance apart.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold">Logo</label>
            <div className="flex items-center gap-4">
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt="Logo"
                  className="h-16 w-16 rounded-[15px] border border-[var(--line)] object-cover bg-white"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-[15px] border border-dashed border-[var(--line)] bg-[var(--bg)] font-display text-lg font-bold text-[var(--muted)]">
                  {initial}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="rounded-[9px] border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--plat-soft)] transition-colors"
                  >
                    Choose logo
                  </button>
                  {brand.logoUrl && (
                    <button
                      type="button"
                      onClick={() => set("logoUrl", "")}
                      className="rounded-[9px] border border-[var(--warn-soft)] bg-white text-[var(--warn)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--warn-soft)] transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-[var(--muted)]">Square image, up to 5MB</span>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      const base64 = await resizeImageToBase64(file, 256, 256, "square");
                      set("logoUrl", base64);
                      toast.success("Logo loaded!");
                    } catch (err) {
                      toast.error("Could not read logo image.");
                    }
                  }
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold">Banner / Cover picture</label>
            <div className="flex flex-col gap-3">
              {brand.bannerUrl ? (
                <img
                  src={brand.bannerUrl}
                  alt="Banner"
                  className="h-28 w-full rounded-[15px] border border-[var(--line)] object-cover bg-[var(--bg)]"
                />
              ) : (
                <div className="flex h-28 w-full items-center justify-center rounded-[15px] border border-dashed border-[var(--line)] bg-[var(--bg)] text-sm font-medium text-[var(--muted)]">
                  No cover picture uploaded
                </div>
              )}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  className="rounded-[9px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2 text-xs font-bold hover:bg-[var(--plat-soft)] transition-colors"
                >
                  Choose cover photo
                </button>
                {brand.bannerUrl && (
                  <button
                    type="button"
                    onClick={() => set("bannerUrl", "")}
                    className="rounded-[9px] border border-[var(--warn-soft)] bg-white text-[var(--warn)] px-3.5 py-2 text-xs font-bold hover:bg-[var(--warn-soft)] transition-colors"
                  >
                    Remove
                  </button>
                )}
                <span className="text-[11px] text-[var(--muted)]">Recommended: 800x300 landscape photo</span>
              </div>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      const base64 = await resizeImageToBase64(file, 800, 300, "aspect");
                      set("bannerUrl", base64);
                      toast.success("Banner image loaded!");
                    } catch (err) {
                      toast.error("Could not read banner image.");
                    }
                  }
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <button
            onClick={save}
            disabled={update.isPending}
            className="rounded-[13px] py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--primary)" }}
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
                  className="flex h-[50px] w-[50px] items-center justify-center rounded-[15px] bg-white font-display text-lg font-bold"
                  style={{ color: brand.primaryColor }}
                >
                  {initial}
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="font-display text-[19px] font-bold text-[var(--ink)]">{name}</div>
              <div className="mb-3 text-xs text-[var(--muted)]">{brand.tagline}</div>
              {/* Shows what the customer ACTUALLY sees: your colour on the
                  accent bar and the business name, the balance in Stampd's
                  green. This card used to preview the balance in your brand
                  gradient, which no customer ever sees — picking a colour
                  here would have promised something the app doesn't do. */}
              <div className="relative overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3.5">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: identityAccent(brand.primaryColor) }}
                />
                <div className="text-[11px] text-[var(--soft)]">Points balance</div>
                <div className="mb-1 font-numeral text-3xl leading-none text-[var(--primary)]">
                  1,240
                </div>
                <div className="text-[11px] text-[var(--muted)]">
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
