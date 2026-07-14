import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Facebook, Instagram, Twitter } from "lucide-react";
import {
  useAdminSettings,
  useUpdateAdminSettings,
  type AdminContact as AdminContactData,
} from "../../hooks/useAdminSettings";

const EMPTY_CONTACT: AdminContactData = {
  phone: "",
  email: "",
  address: "",
  latitude: null,
  longitude: null,
  hours: "",
  aboutUs: "",
  socials: { instagram: "", facebook: "", x: "" },
};

function osmEmbedUrl(lat: number, lon: number): string {
  const delta = 0.01;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat},${lon}`;
}

export default function AdminContact() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [contact, setContact] = useState<AdminContactData | null>(null);

  useEffect(() => {
    if (settings && !contact) {
      setContact(settings.contact ?? EMPTY_CONTACT);
    }
  }, [settings, contact]);

  if (isLoading || !contact) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }

  const set = <K extends keyof AdminContactData>(k: K, v: AdminContactData[K]) =>
    setContact((c) => (c ? { ...c, [k]: v } : c));

  const setSocial = (k: keyof AdminContactData["socials"], v: string) =>
    setContact((c) => (c ? { ...c, socials: { ...c.socials, [k]: v } } : c));

  const save = async () => {
    try {
      await update.mutateAsync({ contact });
      toast.success("Contact info saved");
    } catch (err) {
      toast.error((err as Error).message || "Failed to save.");
    }
  };

  const hasLatLong = contact.latitude !== null && contact.longitude !== null;

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Contact</h1>
      <p className="mb-6 text-[var(--muted)]">
        Shown to your customers on their dashboard. Changes preview live on the right.
      </p>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <Field label="Phone">
            <input
              value={contact.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="Email">
            <input
              value={contact.email}
              onChange={(e) => set("email", e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="Address">
            <input
              value={contact.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude">
              <input
                type="number"
                step="any"
                value={contact.latitude ?? ""}
                onChange={(e) => set("latitude", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="27.7172"
                className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                step="any"
                value={contact.longitude ?? ""}
                onChange={(e) => set("longitude", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="85.3240"
                className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Hours">
            <textarea
              value={contact.hours}
              onChange={(e) => set("hours", e.target.value)}
              rows={2}
              placeholder="Mon–Sat: 8am–8pm, Sun: Closed"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="About us">
            <textarea
              value={contact.aboutUs}
              onChange={(e) => set("aboutUs", e.target.value)}
              rows={3}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>

          <Field label="Instagram URL">
            <input
              value={contact.socials.instagram}
              onChange={(e) => setSocial("instagram", e.target.value)}
              placeholder="https://instagram.com/…"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="Facebook URL">
            <input
              value={contact.socials.facebook}
              onChange={(e) => setSocial("facebook", e.target.value)}
              placeholder="https://facebook.com/…"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="X (Twitter) URL">
            <input
              value={contact.socials.x}
              onChange={(e) => setSocial("x", e.target.value)}
              placeholder="https://x.com/…"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>

          <button
            onClick={save}
            disabled={update.isPending}
            className="rounded-[13px] py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {update.isPending ? "Saving…" : "Save contact info"}
          </button>
        </div>

        {/* Live preview */}
        <div className="sticky top-5">
          <div className="mb-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
            Live preview
          </div>
          <div className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white p-4 shadow-lg">
            {hasLatLong && (
              <iframe
                title="Location preview"
                src={osmEmbedUrl(contact.latitude as number, contact.longitude as number)}
                className="mb-3 h-[160px] w-full rounded-[14px] border-0"
              />
            )}
            {contact.address && <div className="mb-1 text-sm font-semibold text-[var(--ink)]">{contact.address}</div>}
            {contact.phone && <div className="mb-1 text-sm text-[var(--muted)]">{contact.phone}</div>}
            {contact.email && <div className="mb-1 text-sm text-[var(--muted)]">{contact.email}</div>}
            {contact.hours && <div className="mb-1 whitespace-pre-line text-sm text-[var(--muted)]">{contact.hours}</div>}
            {contact.aboutUs && <div className="mb-3 text-sm text-[var(--muted)]">{contact.aboutUs}</div>}
            <div className="flex gap-2">
              {contact.socials.instagram && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]">
                  <Instagram className="h-4 w-4" />
                </span>
              )}
              {contact.socials.facebook && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]">
                  <Facebook className="h-4 w-4" />
                </span>
              )}
              {contact.socials.x && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]">
                  <Twitter className="h-4 w-4" />
                </span>
              )}
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
