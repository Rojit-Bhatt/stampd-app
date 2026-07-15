import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { PLATFORM_NAME } from "../../lib/platform";

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

interface CreatedBusiness {
  name: string;
  tenantPath: string;
}

export default function OnboardBusiness() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CreatedBusiness | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onName = (v: string) =>
    setForm((f) => ({ ...f, name: v, slug: slugEdited ? f.slug : slugify(v) }));

  const submit = async () => {
    if (!form.name || !form.slug || !form.adminName || !form.adminEmail || !form.adminPassword) {
      toast.error("Fill in every field.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; business: { name: string }; tenantPath: string }>(
        "/api/platform/businesses",
        { method: "POST", role: "platform", body: form },
      );
      qc.invalidateQueries({ queryKey: ["platformBusinesses"] });
      setDone({ name: res.business.name, tenantPath: res.tenantPath });
      toast.success(`${res.business.name} is live!`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to onboard.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setForm({ name: "", slug: "", adminName: "", adminEmail: "", adminPassword: "" });
    setSlugEdited(false);
    setDone(null);
  };

  if (done) {
    const url = `${window.location.origin}${done.tenantPath}`;
    return (
      <div className="max-w-[620px]">
        <Link to="/platform" className="mb-3.5 inline-block text-[13px] text-[var(--muted)]">
          ← Businesses
        </Link>
        <div className="shadow-ambient rounded-3xl border border-[#CBE4D6] bg-[var(--ok-soft)] p-8 text-center">
          <div
            className="mx-auto mb-4 flex h-15 w-15 items-center justify-center rounded-full text-white"
            style={{ width: 60, height: 60, background: "var(--ok)" }}
          >
            <Check className="h-7 w-7" />
          </div>
          <h2 className="font-display text-[22px] font-extrabold text-[var(--ink)]">
            {done.name} is live!
          </h2>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-[var(--muted)]">
            Share this link with the owner so they can log in and set up their program.
          </p>
          <div className="mb-4 flex items-center justify-between gap-2.5 rounded-[12px] border border-[var(--line)] bg-white px-4 py-3">
            <span className="truncate font-mono text-sm" style={{ color: "var(--plat)" }}>
              {url}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(url).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="stamp-interactive flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-white"
              style={{ background: "var(--plat)" }}
            >
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <div className="flex justify-center gap-2.5">
            <Link
              to="/platform"
              className="rounded-full border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold"
            >
              Back to businesses
            </Link>
            <button
              onClick={reset}
              className="stamp-interactive rounded-full px-5 py-3 text-sm font-bold text-white"
              style={{ background: "var(--plat)" }}
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
        ← Businesses
      </Link>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">
        Onboard a new business
      </h1>
      <p className="mb-6 text-[var(--muted)]">
        Create the tenant and its first admin login. You’ll get a link to hand off to the owner.
      </p>

      <div className="flex flex-col gap-5">
        <Card title="Business">
          <Label>Business name</Label>
          <input
            value={form.name}
            onChange={(e) => onName(e.target.value)}
            placeholder="e.g. Maple & Bloom"
            className="mb-4 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
          />
          <Label>URL handle</Label>
          <div className="flex items-center rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4">
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

        <Card title="Business admin login">
          <div className="flex flex-col gap-3">
            <input
              value={form.adminName}
              onChange={(e) => set("adminName", e.target.value)}
              placeholder="Owner name"
              className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
            />
            <input
              value={form.adminEmail}
              onChange={(e) => set("adminEmail", e.target.value)}
              placeholder="Owner email"
              className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
            />
            <input
              type="password"
              value={form.adminPassword}
              onChange={(e) => set("adminPassword", e.target.value)}
              placeholder="Temporary password"
              className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--plat)] focus:outline-none"
            />
          </div>
        </Card>

        <button
          onClick={submit}
          disabled={busy}
          className="stamp-interactive rounded-full py-4 text-[16px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--plat)" }}
        >
          {busy ? "Creating…" : "Create business & admin"}
        </button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
      <div className="mb-3.5 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">{title}</div>
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[13px] font-semibold">{children}</label>;
}
