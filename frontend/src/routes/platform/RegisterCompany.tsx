import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import toast from "react-hot-toast";
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

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onName = (v: string) =>
    setForm((f) => ({ ...f, name: v, slug: slugEdited ? f.slug : slugify(v) }));

  const submit = async () => {
    if (!form.name || !form.slug || !form.ownerName || !form.ownerEmail || !form.ownerPassword) {
      toast.error("A few fields still need filling in.");
      return;
    }
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
      name: "", slug: "", ownerName: "", ownerEmail: "", ownerPassword: "",
      earnPercent: "", pointsExpiryDays: "",
    });
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
        <div className="shadow-ambient rounded-[var(--radius-card)] border border-[#CBE4D6] bg-[var(--ok-soft)] p-8 text-center">
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
          <div className="mb-4 flex items-center justify-between gap-2.5 rounded-[var(--radius-btn)] border border-[var(--line)] bg-white px-4 py-3">
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
              className="rounded-full border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold"
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
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">
        Register a new company
      </h1>
      <p className="mb-6 text-[var(--muted)]">
        Create the company and its owner. They verify by email, then add their own outlets.
      </p>

      <div className="flex flex-col gap-5">
        <Card title="Company">
          <Label>Company name</Label>
          <input
            value={form.name}
            onChange={(e) => onName(e.target.value)}
            placeholder="e.g. Maple & Bloom"
            className="mb-4 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <Label>URL handle</Label>
          <div className="flex items-center rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4">
            <span className="font-mono text-sm text-[var(--soft)]">{PLATFORM_NAME.toLowerCase()}.app/</span>
            <input
              value={form.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set("slug", slugify(e.target.value));
              }}
              placeholder="maplebloom"
              className="flex-1 bg-transparent px-1 py-3 font-mono text-sm focus:outline-none"
            />
          </div>
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
              onChange={(e) => set("ownerName", e.target.value)}
              placeholder="Owner name"
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <input
              value={form.ownerEmail}
              onChange={(e) => set("ownerEmail", e.target.value)}
              placeholder="Owner email"
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <input
              type="password"
              value={form.ownerPassword}
              onChange={(e) => set("ownerPassword", e.target.value)}
              placeholder="Temporary password"
              className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
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
function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[13px] font-semibold">{children}</label>;
}
