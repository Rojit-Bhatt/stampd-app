import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Store, User, ArrowRight } from "lucide-react";

import { PLATFORM_NAME } from "../lib/platform";
import { AuthSplitShell } from "../components/shared/auth/AuthSplitShell";

// The single entry point every "Log in" button on the marketing site now
// points to. One verification step — which kind of account is this — before
// either sign-in form renders, so AdminLogin and GlobalCustomerLogin never
// have to guess who showed up.
function SelectCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof Store;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="stamp-interactive flex items-center gap-4 rounded-[20px] border border-[var(--lp-line)] bg-white/[0.04] p-5 text-left transition-colors hover:border-[var(--lp-green)]"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--lp-green)]/15 text-[var(--lp-green)]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-[var(--lp-ink)]">{title}</span>
        <span className="block text-[13px] text-[var(--lp-muted)]">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-[var(--lp-muted)]" />
    </Link>
  );
}

export default function LoginSelect() {
  useEffect(() => {
    document.title = `Log in | ${PLATFORM_NAME}`;
  }, []);

  return (
    <AuthSplitShell>
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-[var(--lp-ink)]">Log in</h1>
        <p className="mt-1 text-sm text-[var(--lp-muted)]">First, who's signing in?</p>
      </div>

      <div className="flex flex-col gap-3">
        <SelectCard
          to="/admin-login"
          icon={Store}
          title="Business login"
          description="Company owners and outlet staff"
        />
        <SelectCard
          to="/customer-login"
          icon={User}
          title="Customer login"
          description="Earn and spend points at your favourite places"
        />
      </div>

      <p className="mt-5 text-center text-[13px] text-[var(--lp-muted)]">
        <Link to="/" className="hover:text-[var(--lp-ink)]">← Back to {PLATFORM_NAME}</Link>
      </p>
    </AuthSplitShell>
  );
}
