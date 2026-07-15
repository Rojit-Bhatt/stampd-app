import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  usePlatformContactAdmin,
  useUpdatePlatformContact,
  type PlatformContact as PlatformContactData,
} from "../../hooks/usePlatformContact";
import { Skeleton } from "../../components/ui/skeleton";

const EMPTY_CONTACT: PlatformContactData = {
  phone: "",
  email: "",
  address: "",
  hours: "",
  aboutUs: "",
  socials: { instagram: "", facebook: "", x: "" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

export default function PlatformContact() {
  const { data: settings, isLoading } = usePlatformContactAdmin();
  const update = useUpdatePlatformContact();
  const [contact, setContact] = useState<PlatformContactData | null>(null);

  useEffect(() => {
    if (settings && !contact) {
      setContact(settings ?? EMPTY_CONTACT);
    }
  }, [settings, contact]);

  if (isLoading || !contact) {
    return (
      <div>
        <Skeleton className="mb-2 h-7 w-32" />
        <Skeleton className="mb-6 h-4 w-80" />
        <div className="flex max-w-[560px] flex-col gap-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-1.5 h-3.5 w-24" />
              <Skeleton className="h-11 w-full rounded-[11px]" />
            </div>
          ))}
          <Skeleton className="h-12 w-full rounded-[13px]" />
        </div>
      </div>
    );
  }

  const set = <K extends keyof PlatformContactData>(k: K, v: PlatformContactData[K]) =>
    setContact((c) => (c ? { ...c, [k]: v } : c));

  const setSocial = (k: keyof PlatformContactData["socials"], v: string) =>
    setContact((c) => (c ? { ...c, socials: { ...c.socials, [k]: v } } : c));

  const phoneError = contact.phone && !PHONE_RE.test(contact.phone) ? "Enter a valid phone number." : "";
  const emailError = contact.email && !EMAIL_RE.test(contact.email) ? "Enter a valid email address." : "";
  const hasErrors = Boolean(phoneError || emailError);

  const save = async () => {
    if (hasErrors) return;
    try {
      await update.mutateAsync(contact);
      toast.success("Contact info saved");
    } catch (err) {
      toast.error((err as Error).message || "Failed to save.");
    }
  };

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Contact</h1>
      <p className="mb-6 text-[var(--muted)]">
        Shown to visitors on the public Stampd landing page.
      </p>

      <div className="flex max-w-[560px] flex-col gap-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <Field label="Phone" error={phoneError}>
          <input
            value={contact.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={`w-full rounded-[11px] border bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none ${
              phoneError ? "border-[var(--err)]" : "border-[var(--line)] focus:border-[var(--plat)]"
            }`}
          />
        </Field>
        <Field label="Email" error={emailError}>
          <input
            value={contact.email}
            onChange={(e) => set("email", e.target.value)}
            className={`w-full rounded-[11px] border bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none ${
              emailError ? "border-[var(--err)]" : "border-[var(--line)] focus:border-[var(--plat)]"
            }`}
          />
        </Field>
        <Field label="Address">
          <input
            value={contact.address}
            onChange={(e) => set("address", e.target.value)}
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
          />
        </Field>
        <Field label="Hours">
          <textarea
            value={contact.hours}
            onChange={(e) => set("hours", e.target.value)}
            rows={2}
            placeholder="Mon–Fri: 9am–5pm"
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
          />
        </Field>
        <Field label="About us">
          <textarea
            value={contact.aboutUs}
            onChange={(e) => set("aboutUs", e.target.value)}
            rows={3}
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
          />
        </Field>
        <Field label="Instagram URL">
          <input
            value={contact.socials.instagram}
            onChange={(e) => setSocial("instagram", e.target.value)}
            placeholder="https://instagram.com/…"
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
          />
        </Field>
        <Field label="Facebook URL">
          <input
            value={contact.socials.facebook}
            onChange={(e) => setSocial("facebook", e.target.value)}
            placeholder="https://facebook.com/…"
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
          />
        </Field>
        <Field label="X (Twitter) URL">
          <input
            value={contact.socials.x}
            onChange={(e) => setSocial("x", e.target.value)}
            placeholder="https://x.com/…"
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
          />
        </Field>

        <button
          onClick={save}
          disabled={update.isPending || hasErrors}
          className="rounded-[13px] py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--plat)" }}
        >
          {update.isPending ? "Saving…" : "Save contact info"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-semibold text-[var(--err)]">{error}</p>}
    </div>
  );
}
