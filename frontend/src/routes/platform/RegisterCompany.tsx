import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import toast from "@/lib/toast";
import { apiRequest } from "../../lib/api";
import { PLATFORM_NAME } from "../../lib/platform";

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

interface CreatedCompany {
  name: string;
  ownerEmail: string;
}

export default function RegisterCompany() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    ownerName: "",
    ownerEmail: "",
    phone: "",
    ownerPassword: "",
    // "" means "use the platform default". These become the company's
    // programDefaults — the value every outlet under it inherits — so a
    // blank here is a fallback, not an override.
    earnPercent: "",
    pointsExpiryDays: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CreatedCompany | null>(null);
  const [copied, setCopied] = useState(false);
  // Per-field inline errors (red label + red border) replacing the single
  // generic toast. Shows after the first attempt; clears on typing.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [attempted, setAttempted] = useState(false);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onName = (v: string) =>
    setForm((f) => ({ ...f, name: v, slug: slugEdited ? f.slug : slugify(v) }));

  const required: (keyof typeof form)[] = ["name", "slug", "ownerName", "ownerEmail", "ownerPassword"];
  const fieldLabels: Record<string, string> = {
    name: "Company name",
    slug: "URL handle",
    ownerName: "Owner name",
    ownerEmail: "Owner email",
    ownerPassword: "Temporary password",
  };
  const submit = async () => {
    setAttempted(true);
    const errors: Partial<Record<keyof typeof form, string>> = {};
    for (const k of required) {
      if (!form[k]) errors[k] = `${fieldLabels[k]} is required.`;
    }
    if (form.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail))
      errors.ownerEmail = "That doesn't look like an email address — check the spelling.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const { earnPercent, pointsExpiryDays, ...rest } = form;
      // Only send the fields that were actually filled in; anything omitted
      // falls back to the platform default server-side.
      const programDefaults: Record<string, number> = {};
      if (earnPercent !== "") programDefaults.earnPercent = Number(earnPercent);
      if (pointsExpiryDays !== "") programDefaults.pointsExpiryDays = Number(pointsExpiryDays);

      const res = await apiRequest<{ success: boolean; company: { name: string } }>(
        "/api/platform/companies",
        {
          method: "POST",
          role: "platform",
          body: Object.keys(programDefaults).length ? { ...rest, programDefaults } : rest,
        },
      );
      qc.invalidateQueries({ queryKey: ["platformCompanies"] });
      setDone({ name: res.company.name, ownerEmail: form.ownerEmail });
      toast.success(`${res.company.name} is live!`);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't register that company — try again.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setForm({
      name: "", slug: "", ownerName: "", ownerEmail: "", phone: "", ownerPassword: "",
      earnPercent: "", pointsExpiryDays: "",
    });
    setFieldErrors({});
    setAttempted(false);
    setSlugEdited(false);
    setDone(null);
  };

  if (done) {
    // The staff sign-in, NOT the company path. A company slug alone has no
    // page — `/:companySlug` redirects to /explore, the customer directory —
    // so sharing it would send the new owner somewhere they can't sign in.
    // Staff login is slug-less now: the credentials decide where they land.
    const url = `${window.location.origin}/admin-login`;
    return (
      <div className="max-w-[620px]">
        <Link to="/platform" className="mb-3.5 inline-block text-[13px] text-[var(--muted)]">
          ← Companies
        </Link>
        <div className="shadow-ambient rounded-[var(--radius-card)] border border-[var(--ok)]/30 bg-[var(--ok-soft)] p-8 text-center">
          <div
            className="mx-auto mb-4 flex h-15 w-15 items-center justify-center rounded-full text-white"
            style={{ width: 60, height: 60, background: "var(--ok)" }}
          >
            <Check className="h-7 w-7" />
          </div>
          <h2 className="font-display text-[22px] font-bold text-[var(--ink)]">
            {done.name} is live!
          </h2>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-[var(--muted)]">
            We've emailed {done.ownerEmail || "the owner"} a link to verify their address. They sign
            in here once they have — then they can add their outlets.
          </p>
          <div className="mb-4 flex items-center justify-between gap-2.5 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <span className="truncate font-mono text-sm" style={{ color: "var(--primary-deep)" }}>
              {url}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(url).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="stamp-interactive flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-white"
              style={{ background: "var(--primary)" }}
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="flex justify-center gap-2.5">
            <Link
              to="/platform"
              className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-bold"
            >
              Back to companies
            </Link>
            <button
              onClick={reset}
              className="stamp-interactive rounded-full px-5 py-3 text-sm font-bold text-white"
              style={{ background: "var(--primary)" }}
            >
              Onboard another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[620px]">
      <Link to="/platform" className="mb-3.5 inline-block text-[13px] text-[var(--muted)]">
        ← Companies
      </Link>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.015em] text-[var(--ink)]">
        Register a new company
      </h1>
      <p className="mb-6 text-[var(--muted)]">
        Create the company and its owner. They verify by email, then add their own outlets.
      </p>

      <div className="flex flex-col gap-5">
        <Card title="Company">
          <Label htmlFor="company-name">Company name</Label>
          <input
            id="company-name"
            value={form.name}
            onChange={(e) => {
              onName(e.target.value);
              setFieldErrors((f) => ({ ...f, name: undefined }));
            }}
            onBlur={() => {
              if (attempted || form.name.length > 0)
                setFieldErrors((f) => ({ ...f, name: form.name ? undefined : "Company name is required." }));
            }}
            placeholder="e.g. Maple & Bloom"
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? "company-name-error" : undefined}
            className={`mb-4 w-full rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none ${
              fieldErrors.name
                ? "border-[var(--err)]"
                : "border-[var(--line)] focus:border-[var(--primary)]"
            }`}
          />
          {fieldErrors.name && (
            <p id="company-name-error" role="alert" className="-mt-2 mb-4 pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
              {fieldErrors.name}
            </p>
          )}
          <Label htmlFor="company-slug">URL handle</Label>
          <div className={`flex items-center rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 ${fieldErrors.slug ? "border-[var(--err)]" : "border-[var(--line)]"}`}>
            <span className="font-mono text-sm text-[var(--soft)]">{PLATFORM_NAME.toLowerCase()}.app/</span>
            <input
              id="company-slug"
              value={form.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set("slug", slugify(e.target.value));
                setFieldErrors((f) => ({ ...f, slug: undefined }));
              }}
              onBlur={() => {
                if (attempted || form.slug.length > 0)
                  setFieldErrors((f) => ({ ...f, slug: form.slug ? undefined : "URL handle is required." }));
              }}
              placeholder="maplebloom"
              aria-invalid={!!fieldErrors.slug}
              aria-describedby={fieldErrors.slug ? "company-slug-error" : undefined}
              className="flex-1 bg-transparent px-1 py-3 font-mono text-sm focus:outline-none"
            />
          </div>
          {fieldErrors.slug && (
            <p id="company-slug-error" role="alert" className="-mt-2 mb-2 pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
              {fieldErrors.slug}
            </p>
          )}
        </Card>

        <Card title="Loyalty program">
          <p className="mb-3 text-[13px] text-[var(--muted)]">
            The defaults every outlet under this company inherits. Each outlet can override them
            later from its own console.
          </p>
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[var(--soft)]">
                Earn rate — % of the bill back as points
              </span>
              <input
                value={form.earnPercent}
                onChange={(e) => set("earnPercent", e.target.value)}
                placeholder="100 (platform default)"
                type="number"
                min={0}
                className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[var(--soft)]">
                Points expiry — days of inactivity
              </span>
              <input
                value={form.pointsExpiryDays}
                onChange={(e) => set("pointsExpiryDays", e.target.value)}
                placeholder="0 (never expire)"
                type="number"
                min={0}
                className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            </label>
          </div>
        </Card>

        <Card title="Owner login">
          <div className="flex flex-col gap-3">
            <input
              value={form.ownerName}
              onChange={(e) => {
                set("ownerName", e.target.value);
                setFieldErrors((f) => ({ ...f, ownerName: undefined }));
              }}
              onBlur={() => {
                if (attempted || form.ownerName.length > 0)
                  setFieldErrors((f) => ({ ...f, ownerName: form.ownerName ? undefined : "Owner name is required." }));
              }}
              placeholder="Owner name"
              aria-invalid={!!fieldErrors.ownerName}
              aria-describedby={fieldErrors.ownerName ? "owner-name-error" : undefined}
              className={`rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none ${
                fieldErrors.ownerName
                  ? "border-[var(--err)]"
                  : "border-[var(--line)] focus:border-[var(--primary)]"
              }`}
            />
            {fieldErrors.ownerName && (
              <p id="owner-name-error" role="alert" className="-mt-1.5 pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
                {fieldErrors.ownerName}
              </p>
            )}
            <input
              value={form.ownerEmail}
              onChange={(e) => {
                set("ownerEmail", e.target.value);
                setFieldErrors((f) => ({ ...f, ownerEmail: undefined }));
              }}
              onBlur={() => {
                if (attempted || form.ownerEmail.length > 0)
                  setFieldErrors((f) => ({
                    ...f,
                    ownerEmail: !form.ownerEmail
                      ? "Owner email is required."
                      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)
                        ? undefined
                        : "That doesn't look like an email address — check the spelling.",
                  }));
              }}
              placeholder="Owner email"
              type="email"
              aria-invalid={!!fieldErrors.ownerEmail}
              aria-describedby={fieldErrors.ownerEmail ? "owner-email-error" : undefined}
              className={`rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none ${
                fieldErrors.ownerEmail
                  ? "border-[var(--err)]"
                  : "border-[var(--line)] focus:border-[var(--primary)]"
              }`}
            />
            {fieldErrors.ownerEmail && (
              <p id="owner-email-error" role="alert" className="-mt-1.5 pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
                {fieldErrors.ownerEmail}
              </p>
            )}
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="Owner phone"
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <input
              type="password"
              value={form.ownerPassword}
              onChange={(e) => {
                set("ownerPassword", e.target.value);
                setFieldErrors((f) => ({ ...f, ownerPassword: undefined }));
              }}
              onBlur={() => {
                if (attempted || form.ownerPassword.length > 0)
                  setFieldErrors((f) => ({
                    ...f,
                    ownerPassword: form.ownerPassword ? undefined : "A temporary password is required.",
                  }));
              }}
              placeholder="Temporary password"
              aria-invalid={!!fieldErrors.ownerPassword}
              aria-describedby={fieldErrors.ownerPassword ? "owner-password-error" : undefined}
              className={`rounded-[var(--radius-btn)] border bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none ${
                fieldErrors.ownerPassword
                  ? "border-[var(--err)]"
                  : "border-[var(--line)] focus:border-[var(--primary)]"
              }`}
            />
            {fieldErrors.ownerPassword && (
              <p id="owner-password-error" role="alert" className="-mt-1.5 pl-1 text-xs font-semibold text-[var(--err)]" aria-live="assertive">
                {fieldErrors.ownerPassword}
              </p>
            )}
          </div>
        </Card>

        <button
          onClick={submit}
          disabled={busy}
          className="stamp-interactive rounded-full py-4 text-[16px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--primary)" }}
        >
          {busy ? "Creating…" : "Create company & owner"}
        </button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
      <div className="mb-3.5 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">{title}</div>
      {children}
    </div>
  );
}
function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold">
      {children}
    </label>
  );
}
