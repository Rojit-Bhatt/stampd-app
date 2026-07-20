import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Facebook, Instagram, Twitter, MapPin, Phone, Mail, Clock } from "lucide-react";

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
  socials: { instagram: "", facebook: "", x: "", tiktok: "" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

export default function AdminContact() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [contact, setContact] = useState<AdminContactData | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);

  useEffect(() => {
    if (settings && !contact) {
      const initialContact = settings.contact ?? EMPTY_CONTACT;
      setContact(initialContact);
      setSearchQuery(initialContact.address || "");
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

  const phoneError = contact.phone && !PHONE_RE.test(contact.phone) ? "Enter a valid phone number." : "";
  const emailError = contact.email && !EMAIL_RE.test(contact.email) ? "Enter a valid email address." : "";
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
        if (data.length === 0) {
          toast.error("No locations found for that search. Try an address or outlet name.");
        }
      } else {
        toast.error("Failed to search location.");
      }
    } catch (err) {
      toast.error("Error searching location.");
    } finally {
      setSearching(false);
    }
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

          <div className="relative">
            <label className="mb-1.5 block text-sm font-bold">Business Outlet Location</label>
            <div className="flex gap-2">
              <input
                id="location-search-input"
                type="text"
                placeholder="Search for physical address or outlet location..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value) {
                    setSearchResults([]);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className="flex-1 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
              <button
                id="location-search-btn"
                type="button"
                onClick={handleSearch}
                disabled={searching}
                className="rounded-[11px] bg-[var(--primary)] text-white px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div id="search-results-dropdown" className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-[11px] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-lg">
                {searchResults.map((result, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      set("address", result.display_name);
                      set("latitude", Number(result.lat));
                      set("longitude", Number(result.lon));
                      setSearchQuery(result.display_name);
                      setSearchResults([]);
                    }}
                    className="w-full rounded-[8px] px-3 py-2 text-left text-xs hover:bg-[var(--plat-soft)] transition-colors text-[var(--ink)] block truncate"
                  >
                    {result.display_name}
                  </button>
                ))}
              </div>
            )}

            {contact.address && (
              <div id="selected-address-badge" className="mt-3 rounded-[11px] border border-[var(--line)] bg-[var(--plat-soft)] px-3.5 py-2.5 text-xs text-[var(--ink)] flex items-center justify-between">
                <span className="truncate font-semibold flex-1 mr-2">{contact.address}</span>
                <button
                  type="button"
                  onClick={() => {
                    set("address", "");
                    set("latitude", null);
                    set("longitude", null);
                    setSearchQuery("");
                  }}
                  className="text-xs font-bold text-[var(--warn)] hover:underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <Field label="Hours">
            <textarea
              id="contact-hours"
              value={contact.hours}
              onChange={(e) => set("hours", e.target.value)}
              rows={2}
              placeholder="Mon–Sat: 8am–8pm, Sun: Closed"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </Field>
          
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
          <div className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white p-4 shadow-lg">
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
