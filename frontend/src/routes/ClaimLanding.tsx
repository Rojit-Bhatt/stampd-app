import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Phone } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../lib/api";
import { useTenant } from "../context/TenantContext";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { PointsCelebration } from "../components/customer/PointsCelebration";
import { tenantPath } from "../lib/tenantPath";

type Stage =
  | "resolving"
  | "checking"
  | "fulfilling"
  | "choose"
  | "awaiting-verification"
  | "success"
  | "error";

interface ClaimResult {
  pointsEarned: number;
  billAmount: number;
  balance: number;
  multiplier?: number;
  campaignName?: string | null;
}

// StrictMode-safe module-scope cache — same pattern as VerifyEmail.tsx /
// GlobalVerifyEmail.tsx: converting the token to a pending claim is a
// one-shot server call keyed by the QR's raw token.
const startRequests = new Map<string, Promise<{ success: boolean; data: { pendingClaimId: string } }>>();

function startClaimOnce(token: string) {
  let promise = startRequests.get(token);
  if (!promise) {
    promise = apiRequest("/api/claim/start", { method: "POST", body: { token } });
    startRequests.set(token, promise);
  }
  return promise;
}

export default function ClaimLanding() {
  const { companySlug = "", outletSlug = "" } = useParams();
  const slug = outletSlug;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { user, isLoading, ensureTenantSession, login, registerUser } = useCustomerAuth();

  const [stage, setStage] = useState<Stage>("resolving");
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const checkedOnce = useRef(false);

  // Step 1: convert the scanned QR token into a longer-lived pending claim.
  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStage("error");
      setErrorMsg("Missing QR token.");
      return;
    }
    startClaimOnce(token)
      .then((res) => {
        setPendingClaimId(res.data.pendingClaimId);
        setStage("checking");
      })
      .catch((e) => {
        setStage("error");
        setErrorMsg((e as Error).message || "This code is invalid or has expired.");
      });
  }, [params]);

  // Step 2: once TenantSessionSync (mounted alongside this page) has settled,
  // see if we're already tenant-authenticated — if so, fulfill immediately
  // with zero forms; otherwise ask the customer to sign in or sign up.
  useEffect(() => {
    if (stage !== "checking" || isLoading || checkedOnce.current) return;
    checkedOnce.current = true;
    setStage(user ? "fulfilling" : "choose");
  }, [stage, isLoading, user]);

  const fulfill = async (claimId: string) => {
    setStage("fulfilling");
    try {
      const res = await apiRequest<{ success: boolean; data: ClaimResult }>(
        `/api/claim/${claimId}/fulfill`,
        { method: "POST" },
      );
      setResult(res.data);
      setStage("success");
    } catch (e) {
      const message = (e as Error).message || "";
      if (message.toLowerCase().includes("verify your email")) {
        setStage("awaiting-verification");
      } else {
        setStage("error");
        setErrorMsg(message || "Could not add your points.");
      }
    }
  };

  useEffect(() => {
    if (stage === "fulfilling" && pendingClaimId) {
      fulfill(pendingClaimId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pendingClaimId]);

  // Poll while waiting on email verification (possibly from another tab).
  useEffect(() => {
    if (stage !== "awaiting-verification" || !pendingClaimId) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiRequest<{ success: boolean; data: { fulfilled: boolean; expired: boolean } & Partial<ClaimResult> }>(
          `/api/claim/${pendingClaimId}/status`,
        );
        if (res.data.fulfilled) {
          setResult({
            pointsEarned: res.data.pointsEarned ?? 0,
            billAmount: res.data.billAmount ?? 0,
            balance: res.data.balance ?? 0,
            multiplier: res.data.multiplier,
            campaignName: res.data.campaignName,
          });
          setStage("success");
        } else if (res.data.expired) {
          setStage("error");
          setErrorMsg("This code expired before you verified — ask staff for a new one.");
        }
      } catch {
        // transient — keep polling
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [stage, pendingClaimId]);

  const onLogin = async (email: string, password: string) => {
    setBusy(true);
    try {
      await login(email, password);
      await ensureTenantSession(slug, tenant?.id ?? null);
      if (pendingClaimId) fulfill(pendingClaimId);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't sign you in — try again.");
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async (name: string, email: string, password: string, phone: string) => {
    setBusy(true);
    try {
      await registerUser(name, email, password, phone, pendingClaimId ?? undefined);
      setStage("awaiting-verification");
    } catch (e) {
      toast.error((e as Error).message || "Couldn't create your account — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "resolving" || stage === "checking" || stage === "fulfilling") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
        <h2 className="font-display text-xl font-bold text-[var(--ink)]">Couldn't add your points</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">{errorMsg}</p>
        <Link
          to={tenantPath(companySlug, slug)}
          className="mt-6 rounded-[13px] px-6 py-3 text-sm font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          Back to {tenant?.name || "home"}
        </Link>
      </div>
    );
  }

  if (stage === "awaiting-verification") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
        <Mail className="h-10 w-10 text-[var(--brand)]" />
        <h2 className="mt-4 font-display text-xl font-bold text-[var(--ink)]">Check your email</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
          Click the verification link we sent you — your points at {tenant?.name} will be added
          automatically the moment you do, even from another device.
        </p>
      </div>
    );
  }

  if (stage === "success" && result) {
    return (
      <PointsCelebration
        variant="earn"
        points={result.pointsEarned}
        billAmount={result.billAmount}
        balance={result.balance}
        multiplier={result.multiplier}
        campaignName={result.campaignName}
        onDone={() => navigate(tenantPath(companySlug, slug, "dashboard"))}
        doneLabel="Go to dashboard"
      />
    );
  }

  // stage === "choose"
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-[17px] font-display text-[22px] font-extrabold text-white"
          style={{ background: "var(--brand)" }}
        >
          {(tenant?.name || "?").charAt(0).toUpperCase()}
        </div>
        <h1 className="font-display text-[22px] font-extrabold text-[var(--ink)]">
          Scan to collect at {tenant?.name}
        </h1>
        <p className="mb-6 mt-1 text-sm text-[var(--muted)]">
          {mode === "login" ? "Sign in to add your points." : "Create an account to add your points."}
        </p>

        {mode === "login" ? (
          <ClaimLoginForm busy={busy} onSubmit={onLogin} />
        ) : (
          <ClaimRegisterForm busy={busy} onSubmit={onRegister} />
        )}

        <p className="mt-6 text-center text-[13px] text-[var(--muted)]">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="font-bold text-[var(--brand)] hover:underline"
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

function ClaimLoginForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email, password);
      }}
      className="flex flex-col gap-3"
    >
      <ClaimField icon={<Mail className="h-4 w-4 text-[var(--soft)]" />}>
        <input
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
        />
      </ClaimField>
      <ClaimField icon={<Lock className="h-4 w-4 text-[var(--soft)]" />}>
        <input
          type="password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
        />
      </ClaimField>
      <button
        type="submit"
        disabled={busy}
        className="mt-2 w-full rounded-[15px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {busy ? "Please wait…" : "Sign in & add points"}
      </button>
    </form>
  );
}

function ClaimRegisterForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (name: string, email: string, password: string, phone: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const local = phone.replace(/\D/g, "").replace(/^0+/, "");
        onSubmit(name, email, password, `+977${local}`);
      }}
      className="flex flex-col gap-3"
    >
      <ClaimField icon={<User className="h-4 w-4 text-[var(--soft)]" />}>
        <input
          type="text"
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
        />
      </ClaimField>
      <ClaimField icon={<Mail className="h-4 w-4 text-[var(--soft)]" />}>
        <input
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
        />
      </ClaimField>
      <ClaimField icon={<Phone className="h-4 w-4 text-[var(--soft)]" />}>
        <span className="text-sm text-[var(--soft)]">+977</span>
        <input
          type="tel"
          required
          inputMode="numeric"
          placeholder="98XXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
        />
      </ClaimField>
      <ClaimField icon={<Lock className="h-4 w-4 text-[var(--soft)]" />}>
        <input
          type="password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--soft)] focus:outline-none"
        />
      </ClaimField>
      <button
        type="submit"
        disabled={busy}
        className="mt-2 w-full rounded-[15px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {busy ? "Please wait…" : "Create account"}
      </button>
    </form>
  );
}

function ClaimField({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 transition-colors focus-within:border-[var(--brand)]">
      <span>{icon}</span>
      {children}
    </div>
  );
}
