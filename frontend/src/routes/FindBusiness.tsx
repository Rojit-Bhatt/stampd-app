import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { PLATFORM_NAME } from "../lib/platform";

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

type Intent = "customer" | "admin";
type Status = "idle" | "checking" | "notFound" | "found";

const COPY: Record<Intent, { title: string; sub: string; cta: string }> = {
  admin: {
    title: "Find your business",
    sub: "Enter your business name to reach your admin console.",
    cta: "Continue to admin login",
  },
  customer: {
    title: "Find your business",
    sub: "Enter the business whose stamp card you want to open.",
    cta: "Continue",
  },
};

export default function FindBusiness({ intent }: { intent: Intent }) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [foundName, setFoundName] = useState("");

  const copy = COPY[intent];

  useEffect(() => {
    document.title = `${copy.title} | ${PLATFORM_NAME}`;
  }, [copy.title]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = slugify(input);
    if (!slug) return;

    setStatus("checking");
    try {
      const res = await apiRequest<{ success: boolean; tenant: { slug: string; name: string } }>(
        "/api/tenant",
        { headers: { "X-Tenant-Slug": slug } },
      );
      setFoundName(res.tenant.name);
      setStatus("found");
      navigate(intent === "admin" ? `/${res.tenant.slug}/admin/login` : `/${res.tenant.slug}/login`);
    } catch {
      setStatus("notFound");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-5 inline-block text-[13px] text-[var(--muted)] hover:text-[var(--ink)]">
          ← Back
        </Link>
        <div className="shadow-ambient rounded-3xl bg-[var(--surface)] p-6">
          <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">{copy.title}</h1>
          <p className="mb-5 mt-1 text-sm text-[var(--muted)]">{copy.sub}</p>

          {status === "found" ? (
            <p className="text-sm text-[var(--muted)]">Taking you to {foundName}…</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="flex items-center rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 focus-within:border-[var(--plat)]">
                <span className="font-mono text-sm text-[var(--soft)]">
                  {PLATFORM_NAME.toLowerCase()}.app/
                </span>
                <input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (status === "notFound") setStatus("idle");
                  }}
                  placeholder="your-business"
                  autoFocus
                  className="flex-1 bg-transparent px-1 py-3 font-mono text-sm text-[var(--ink)] focus:outline-none"
                />
              </div>

              {status === "notFound" && (
                <p className="text-xs font-semibold text-[var(--err)]">
                  We couldn't find a business called "{input}". Check the spelling and try again.
                </p>
              )}

              <button
                type="submit"
                disabled={status === "checking" || !input.trim()}
                className="stamp-interactive rounded-[13px] py-3.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "var(--plat)" }}
              >
                {status === "checking" ? "Checking…" : copy.cta}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
