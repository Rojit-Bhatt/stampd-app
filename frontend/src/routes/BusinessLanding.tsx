import { Link } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import { tenantPath } from "../lib/tenantPath";

// Public, tenant-branded landing shown at /:slug. Join / sign-in entry point.
export default function BusinessLanding() {
  const { companySlug, slug, tenant } = useTenant();
  const branding = tenant?.branding;
  const program = tenant?.program;
  const initial = (tenant?.name || "?").charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen w-full items-start justify-center bg-[var(--bg)] sm:py-8">
      <div className="flex min-h-screen w-full max-w-full flex-col overflow-hidden bg-[var(--surface)] sm:min-h-0 sm:max-w-[420px] sm:rounded-[40px] sm:border sm:border-[var(--line)] sm:shadow-xl">
        {/* Banner */}
        <div
          className="relative flex h-[220px] items-end p-6"
          style={
            branding?.bannerUrl
              ? { backgroundImage: `url(${branding.bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: "linear-gradient(150deg, var(--brand), var(--brand-deep))" }
          }
        >
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${tenant?.name} logo`}
              className="h-[66px] w-[66px] rounded-[20px] bg-white object-cover shadow-lg"
            />
          ) : (
            <div className="flex h-[66px] w-[66px] items-center justify-center rounded-[20px] bg-white font-display text-[26px] font-extrabold shadow-lg" style={{ color: "var(--brand)" }}>
              {initial}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 px-6 pb-8 pt-6">
          <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">{tenant?.name}</h1>
          <p className="mb-6 text-[var(--muted)]">{branding?.tagline}</p>

          <div className="shadow-ambient mb-6 rounded-3xl bg-[var(--surface-container)] p-5">
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--brand)" }}>
              How it works
            </div>
            <p className="text-[15px] leading-relaxed text-[var(--ink)]">
              Every visit earns points on what you spend
              {program?.earnPercent === 100
                ? " — 1 point per rupee"
                : program?.earnPercent
                  ? ` — ${program.earnPercent}% of your bill back`
                  : ""}
              . Spend them on the good stuff, no paper card to lose.
            </p>
          </div>

          <Link
            to={tenantPath(companySlug, slug, "register")}
            className="stamp-interactive mb-2.5 block w-full rounded-full py-4 text-center text-[16px] font-bold text-white"
            style={{ background: "var(--brand)" }}
          >
            Join &amp; start collecting
          </Link>
          <Link
            to={tenantPath(companySlug, slug, "login")}
            className="block w-full rounded-[15px] py-3.5 text-center font-semibold text-[var(--muted)]"
          >
            I already have an account
          </Link>
        </div>
      </div>
    </div>
  );
}
