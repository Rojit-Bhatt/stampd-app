import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Facebook, Instagram, Twitter, MapPin, Phone, Mail, Clock, Star } from "lucide-react";

function TiktokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.59 4.23.95.1 1.9.1 2.85.1v3.91c-.95 0-1.9 0-2.85-.1-.28.87-.85 1.62-1.59 2.16v4.61c.05 1.34-.33 2.68-1.08 3.79-.75 1.11-1.85 1.9-3.13 2.23-1.28.33-2.63.14-3.79-.53-1.16-.67-1.98-1.78-2.31-3.13-.33-1.28-.14-2.63.53-3.79.67-1.16 1.78-1.98 3.13-2.31V14.1c-.67.11-1.32.37-1.89.77-.57.4-1.01.94-1.29 1.58-.28.64-.37 1.35-.26 2.05.11.7.42 1.35.89 1.88.47.53 1.09.9 1.79 1.07.7.17 1.43.14 2.12-.09.69-.23 1.29-.65 1.73-1.22.44-.57.69-1.27.72-1.99V4.65c-.11-1.54.51-3.07 1.67-4.1.95-.8 2.16-1.23 3.4-1.23-.08.24-.08.49-.08.73z" />
    </svg>
  );
}
import {
  useAdminSettings,
  useUpdateAdminSettings,
  type AdminContact as AdminContactData,
} from "../../hooks/useAdminSettings";
import { Skeleton } from "../../components/ui/skeleton";

const EMPTY_CONTACT: AdminContactData = {
  phone: "",
  email: "",
  address: "",
  latitude: null,
  longitude: null,
  hours: "",
  aboutUs: "",
  googleReviewUrl: "",
  socials: { instagram: "", facebook: "", x: "", tiktok: "" },
};

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];

function isValidEmail(value: string): boolean {
  if (!EMAIL_FORMAT_RE.test(value)) return false;
  const domain = value.split("@")[1]?.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function isValidPhone(value: string): boolean {
  const digitsOnly = value.replace(/[^0-9]/g, "").replace(/^977/, "");
  return /^[0-9]{10}$/.test(digitsOnly);
}

interface DayHour {
  day: string;
  isOpen: boolean;
  openTime: string; // e.g. "08:00"
  closeTime: string; // e.g. "20:00"
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function format12h(time24: string): string {
  if (!time24) return "";
  const [hoursStr, minutesStr] = time24.split(":");
  let hours = parseInt(hoursStr, 10);
  const minutes = minutesStr || "00";
  if (isNaN(hours)) return time24;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours}:${minutes} ${ampm}`;
}

function parseTimePart(timeStr: string): string {
  const cleaned = timeStr.trim().replace(/\s+/g, " ");
  const match = cleaned.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3].toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  const matchShort = cleaned.match(/^(\d+)\s*(am|pm)$/i);
  if (matchShort) {
    let hours = parseInt(matchShort[1], 10);
    const ampm = matchShort[2].toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:00`;
  }
  return cleaned;
}

const parseHoursString = (hoursStr: string): DayHour[] => {
  const defaultHours = DAYS_OF_WEEK.map(day => ({
    day,
    isOpen: day !== "Sunday",
    openTime: "08:00",
    closeTime: "20:00",
  }));

  if (!hoursStr) return defaultHours;

  const lines = hoursStr.split("\n");
  const parsed = [...defaultHours];

  lines.forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const dayName = match[1].trim();
      const value = match[2].trim();
      const dayIndex = DAYS_OF_WEEK.findIndex(
        d => d.toLowerCase() === dayName.toLowerCase() || d.substring(0, 3).toLowerCase() === dayName.toLowerCase()
      );
      if (dayIndex !== -1) {
        if (value.toLowerCase().includes("closed")) {
          parsed[dayIndex].isOpen = false;
        } else {
          parsed[dayIndex].isOpen = true;
          const times = value.split("-");
          if (times.length === 2) {
            parsed[dayIndex].openTime = parseTimePart(times[0]);
            parsed[dayIndex].closeTime = parseTimePart(times[1]);
          }
        }
      }
    }
  });

  return parsed;
};

const serializeHours = (dayHours: DayHour[]): string => {
  return dayHours
    .map((dh) => {
      if (!dh.isOpen) {
        return `${dh.day}: Closed`;
      }
      return `${dh.day}: ${format12h(dh.openTime)} - ${format12h(dh.closeTime)}`;
    })
    .join("\n");
};

export default function AdminContact() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [contact, setContact] = useState<AdminContactData | null>(null);
  const [dayHours, setDayHours] = useState<DayHour[]>([]);

  useEffect(() => {
    if (settings && !contact) {
      const initialContact = settings.contact ?? EMPTY_CONTACT;
      setContact(initialContact);
      setDayHours(parseHoursString(initialContact.hours));
    }
  }, [settings, contact]);

  if (isLoading || !contact) {
    return (
      <div>
        <Skeleton className="mb-2 h-7 w-40" />
        <Skeleton className="mb-6 h-4 w-96" />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-1.5 h-3.5 w-20" />
                <Skeleton className="h-11 w-full rounded-[11px]" />
              </div>
            ))}
            <Skeleton className="h-16 w-full rounded-[11px]" />
            <Skeleton className="h-11 w-full rounded-[13px]" />
          </div>
          <Skeleton className="h-[280px] w-full rounded-[24px]" />
        </div>
      </div>
    );
  }

  const set = <K extends keyof AdminContactData>(k: K, v: AdminContactData[K]) =>
    setContact((c) => (c ? { ...c, [k]: v } : c));

  const setSocial = (k: keyof AdminContactData["socials"], v: string) =>
    setContact((c) => (c ? { ...c, socials: { ...c.socials, [k]: v } } : c));

  const phoneError = contact.phone && !isValidPhone(contact.phone) ? "Enter a valid 10-digit phone number." : "";
  const emailError = contact.email && !isValidEmail(contact.email) ? "Use a Gmail, Yahoo, Outlook, or other major provider address." : "";
  const hasErrors = Boolean(phoneError || emailError);

  const save = async () => {
    if (hasErrors) return;
    try {
      await update.mutateAsync({ contact });
      toast.success("Contact info saved!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const updateDayHour = (index: number, patch: Partial<DayHour>) => {
    setDayHours((prev) => {
      const next = prev.map((dh, i) => (i === index ? { ...dh, ...patch } : dh));
      const serialized = serializeHours(next);
      setContact((c) => (c ? { ...c, hours: serialized } : c));
      return next;
    });
  };

  return (
    <div id="admin-contact-container">
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Contact & Location</h1>
      <p className="mb-6 text-[var(--muted)]">
        Configure the physical outlet details and links. Changes preview live on the right.
      </p>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
          <Field label="Phone" error={phoneError}>
            <input
              id="contact-phone"
              value={contact.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+1 (555) 019-2834"
              className={`w-full rounded-[11px] border bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none ${
                phoneError ? "border-[var(--err)]" : "border-[var(--line)] focus:border-[var(--primary)]"
              }`}
            />
          </Field>
          
          <Field label="Email" error={emailError}>
            <input
              id="contact-email"
              value={contact.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="hello@business.com"
              className={`w-full rounded-[11px] border bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none ${
                emailError ? "border-[var(--err)]" : "border-[var(--line)] focus:border-[var(--primary)]"
              }`}
            />
          </Field>

          <div className="border-t border-[var(--line)] pt-3">
            <label className="mb-3 block text-sm font-bold text-[var(--ink)]">Open Hours</label>
            <div className="flex flex-col gap-3.5 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] p-4 shadow-sm">
              {dayHours.map((dh, index) => (
                <div key={dh.day} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3.5 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    {/* Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => updateDayHour(index, { isOpen: !dh.isOpen })}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        dh.isOpen ? "bg-[var(--primary)]" : "bg-[var(--surface-2)]"
                      }`}
                      id={`toggle-${dh.day.toLowerCase()}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          dh.isOpen ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <span className="text-sm font-bold w-24 text-left text-[var(--ink)]">{dh.day}</span>
                  </div>
                  
                  {dh.isOpen ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={dh.openTime}
                        onChange={(e) => updateDayHour(index, { openTime: e.target.value })}
                        className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
                      />
                      <span className="text-xs text-[var(--muted)]">to</span>
                      <input
                        type="time"
                        value={dh.closeTime}
                        onChange={(e) => updateDayHour(index, { closeTime: e.target.value })}
                        className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
                      />
                    </div>
                  ) : (
                    <span className="text-[11px] font-bold text-[var(--warn)] uppercase tracking-wider bg-[var(--warn-soft)] px-2.5 py-1 rounded-[6px]">
                      Closed
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <Field label="About us">
            <textarea
              id="contact-about"
              value={contact.aboutUs}
              onChange={(e) => set("aboutUs", e.target.value)}
              rows={3}
              placeholder="Tell customers a bit about your store..."
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </Field>

          <Field label="Instagram URL">
            <input
              id="social-instagram"
              value={contact.socials.instagram}
              onChange={(e) => setSocial("instagram", e.target.value)}
              placeholder="https://instagram.com/yourhandle"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </Field>
          
          <Field label="Facebook URL">
            <input
              id="social-facebook"
              value={contact.socials.facebook}
              onChange={(e) => setSocial("facebook", e.target.value)}
              placeholder="https://facebook.com/yourpage"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </Field>
          
          <Field label="X (Twitter) URL">
            <input
              id="social-x"
              value={contact.socials.x}
              onChange={(e) => setSocial("x", e.target.value)}
              placeholder="https://x.com/yourhandle"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </Field>

          <Field label="TikTok URL">
            <input
              id="social-tiktok"
              value={contact.socials.tiktok || ""}
              onChange={(e) => setSocial("tiktok", e.target.value)}
              placeholder="https://tiktok.com/@yourhandle"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </Field>

          <Field label="Google Review URL">
            <input
              id="contact-google-review"
              value={contact.googleReviewUrl || ""}
              onChange={(e) => set("googleReviewUrl", e.target.value)}
              placeholder="https://g.page/r/YOUR_BUSINESS_ID/review"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Direct link for customers to write a Google review. Leave blank to hide the Google Reviews Card.
            </p>
          </Field>

          <button
            id="save-contact-btn"
            onClick={save}
            disabled={update.isPending || hasErrors}
            className="rounded-[13px] py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            style={{ background: "var(--primary)" }}
          >
            {update.isPending ? "Saving…" : "Save contact info"}
          </button>
        </div>

        {/* Live preview */}
        <div className="sticky top-5">
          <div className="mb-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
            Live preview
          </div>
          <div
            className="overflow-hidden rounded-[24px] border p-4 shadow-lg"
            style={{
              background: "#FFFFFF",
              borderColor: "#E4E9E6",
              ["--ink" as any]: "#14201C",
              ["--muted" as any]: "#5C6B64",
              ["--bg" as any]: "#F7F8F7",
              ["--line" as any]: "#E4E9E6",
            }}
          >
            {contact.address && (
              <iframe
                title="Location preview"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(contact.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                className="mb-3 h-[160px] w-full rounded-[14px] border-0"
              />
            )}
            {contact.address && (
              <div className="mb-1 text-sm font-semibold text-[var(--ink)] flex items-start gap-1.5">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-[var(--muted)]" />
                <span className="text-left leading-tight">{contact.address}</span>
              </div>
            )}
            {contact.phone && (
              <div className="mb-1 text-sm text-[var(--muted)] flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-[var(--muted)]" />
                <span>{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="mb-1 text-sm text-[var(--muted)] flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[var(--muted)]" />
                <span>{contact.email}</span>
              </div>
            )}
            {contact.hours && (
              <div className="mb-1 whitespace-pre-line text-sm text-[var(--muted)] flex items-start gap-1.5">
                <Clock className="h-3.5 w-3.5 mt-0.5 text-[var(--muted)]" />
                <span className="text-left">{contact.hours}</span>
              </div>
            )}
            {contact.aboutUs && <div className="mb-3 mt-2 border-t border-[var(--line)] pt-2 text-sm text-[var(--muted)] text-left">{contact.aboutUs}</div>}
            
            <div className="flex gap-2 mt-2">
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
              {contact.socials.tiktok && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]">
                  <TiktokIcon className="h-4 w-4" />
                </span>
              )}
            </div>

            {contact.googleReviewUrl && (
              <div className="mt-4 border-t border-[var(--line)] pt-4 text-left">
                <div className="rounded-[16px] bg-[#f8f9fa] border border-[#e8eaed] p-3.5 flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span className="text-xs font-bold text-[#202124]">Review us on Google</span>
                    <div className="flex text-[#fbbc05]">
                      <Star className="h-3 w-3 fill-current" />
                      <Star className="h-3 w-3 fill-current" />
                      <Star className="h-3 w-3 fill-current" />
                      <Star className="h-3 w-3 fill-current" />
                      <Star className="h-3 w-3 fill-current" />
                    </div>
                  </div>
                  <p className="text-[11px] text-[#5f6368] leading-normal">
                    Love our service? Share your feedback with others on Google!
                  </p>
                  <a
                    href={contact.googleReviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 w-full rounded-[10px] bg-[#1a73e8] text-white py-1.5 px-3 text-[11px] font-bold text-center hover:bg-[#1557b0] transition-colors"
                  >
                    Write a Review
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
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
