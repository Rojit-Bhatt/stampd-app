import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Phone, Timer, AlertTriangle, Check, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../lib/api";
import { useTenant } from "../context/TenantContext";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { EarnCelebration } from "../components/customer/EarnCelebration";
import { ClaimStateScreen } from "../components/customer/ClaimStateScreen";
import { formatPoints } from "../hooks/usePoints";
import { tenantPath } from "../lib/tenantPath";
import { Button } from "@/components/ui/button";

type Stage =
  | "resolving"
  | "checking"
  | "fulfilling"
  | "choose"
  | "awaiting-verification"
  | "success"
  | "error";

// Why a claim failed, so each ending gets the sentence and next step it
// actually needs. A 30-second single-use code scanned on mobile data at a
// counter fails in ordinary ways, and "something went wrong" leaves the
// customer unsure whether to re-scan, ask staff, or wait.
//
// These are classified from the server's message text because the backend
// returns a bare 400 for most of them; only "already-added" carries a real
// code (CLAIM_ALREADY_FULFILLED). Adding codes backend-side would make this
// robust — until then, an unrecognised message falls through to "unknown",
// which still renders a sane screen rather than guessing wrong.
type ClaimFailure = "expired" | "already-used" | "already-added" | "offline" | "unknown";

function classifyFailure(err: Error & { code?: string }): ClaimFailure {
  if (err.code === "CLAIM_ALREADY_FULFILLED") return "already-added";
  // A fetch that never reached the server — the claim itself is untouched and
  // still held, so this must not read as "your points are gone".
  if (!navigator.onLine || err.name === "TypeError") return "offline";
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("expired")) return "expired";
  if (msg.includes("already been used")) return "already-used";
  return "unknown";
}

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
const startRequests = new Map<
  string,
  Promise<{ success: boolean; data: { pendingClaimId: string; claimSecret: string } }>
>();

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
  const [failure, setFailure] = useState<ClaimFailure>("unknown");
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  // Proof that WE are the tab that scanned the QR. The claim id alone is not
  // proof — it's a guessable ObjectId — so every call that binds or reads the
  // claim carries this. Kept in memory only; it never outlives the page.
  const [claimSecret, setClaimSecret] = useState<string | null>(null);
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
        setClaimSecret(res.data.claimSecret);
        setStage("checking");
      })
      .catch((e) => {
        const err = e as Error & { code?: string };
        setFailure(classifyFailure(err));
        setStage("error");
        setErrorMsg(err.message || "This code is invalid or has expired.");
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

  // Shared between the awaiting-verification poll and the already-fulfilled
  // race below: both need "go fetch what actually happened and show it."
  // Sets stage itself on a definitive outcome (fulfilled or expired) and
  // reports whether it did, so callers only need to handle "still nothing
  // to show yet" (transient fetch failure, or genuinely still pending).
  const checkStatus = async (claimId: string, expiredMessage?: string) => {
    try {
      const res = await apiRequest<{ success: boolean; data: { fulfilled: boolean; expired: boolean } & Partial<ClaimResult> }>(
        `/api/claim/${claimId}/status?secret=${encodeURIComponent(claimSecret ?? "")}`,
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
        return true;
      }
      if (res.data.expired && expiredMessage) {
        setStage("error");
        setErrorMsg(expiredMessage);
        return true;
      }
    } catch {
      // transient — caller decides what "not shown" means for it
    }
    return false;
  };

  const fulfill = async (claimId: string) => {
    setStage("fulfilling");
    try {
      const res = await apiRequest<{ success: boolean; data: ClaimResult }>(
        `/api/claim/${claimId}/fulfill`,
        { method: "POST", body: { claimSecret } },
      );
      setResult(res.data);
      setStage("success");
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "CLAIM_ALREADY_FULFILLED") {
        // Not a failure: the points were already awarded, most often by
        // autoFulfillForAccount firing the instant verification landed,
        // moments before this tab (backgrounded while you were in your
        // email app) resumed and tried to fulfill the same claim itself.
        // Show what actually happened instead of a scary error for a
        // claim that, from the customer's side, succeeded.
        const shown = await checkStatus(claimId);
        if (!shown) {
          setFailure("already-added");
          setStage("error");
          setErrorMsg("Your points were already added — check your balance on the dashboard.");
        }
        return;
      }
      const message = err.message || "";
      if (message.toLowerCase().includes("verify your email")) {
        setStage("awaiting-verification");
      } else {
        setFailure(classifyFailure(err));
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
    const interval = setInterval(() => {
      checkStatus(pendingClaimId, "This code expired before you verified — ask staff for a new one.");
    }, 4000);
    return () => clearInterval(interval);
  }, [stage, pendingClaimId, claimSecret]);

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
      await registerUser(
        name, email, password, phone,
        pendingClaimId ?? undefined,
        claimSecret ?? undefined,
      );
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (stage === "error") {
    const home = tenantPath(companySlug, slug);
    const backLabel = `Back to ${tenant?.name || "home"}`;

    // Already added is a SUCCESS, not a failure: most often autoFulfill fired
    // the instant verification landed, moments before this tab (backgrounded
    // while the customer was in their email app) resumed. Styling it red for
    // something that worked would be a lie.
    if (failure === "already-added") {
      return (
        <ClaimStateScreen
          icon={<Check className="h-6 w-6" />}
          tone="good"
          title="Already added"
          body={
            result?.pointsEarned
              ? `Your ${formatPoints(result.pointsEarned)} points landed a moment ago — no need to scan again.`
              : "These points landed a moment ago — no need to scan again."
          }
          figure={
            result?.balance !== undefined
              ? { label: "Balance", value: formatPoints(result.balance) }
              : undefined
          }
          primary={{ label: "See my points", to: tenantPath(companySlug, slug, "dashboard") }}
        />
      );
    }

    if (failure === "expired") {
      return (
        <ClaimStateScreen
          icon={<Timer className="h-6 w-6" />}
          tone="warn"
          title="Code expired"
          body="This code timed out after 30 seconds. Ask staff to generate a fresh one — it's quick."
          primary={{ label: backLabel, to: home }}
        />
      );
    }

    if (failure === "already-used") {
      return (
        <ClaimStateScreen
          icon={<AlertTriangle className="h-6 w-6" />}
          tone="warn"
          title="This code was already scanned"
          body="Each code works once, for one person. Ask staff for a new one for your bill."
          primary={{ label: backLabel, to: home }}
        />
      );
    }

    if (failure === "offline") {
      return (
        <ClaimStateScreen
          icon={<WifiOff className="h-6 w-6" />}
          tone="neutral"
          title="Lost connection"
          body="We couldn't reach the counter. Your claim is safe — it's held for 15 minutes. Reconnect and we'll finish it."
          primary={{
            label: "Try again now",
            onClick: () => {
              if (pendingClaimId) {
                setStage("fulfilling");
              } else {
                window.location.reload();
              }
            },
          }}
          secondary={{ label: backLabel, to: home }}
        />
      );
    }

    return (
      <ClaimStateScreen
        icon={<AlertTriangle className="h-6 w-6" />}
        tone="bad"
        title="Couldn't add your points"
        body={errorMsg}
        primary={{ label: backLabel, to: home }}
      />
    );
  }

  if (stage === "awaiting-verification") {
    return (
      <ClaimStateScreen
        icon={<Mail className="h-6 w-6" />}
        tone="neutral"
        title="Check your email"
        body={
          <>
            Your points at {tenant?.name} are held for you. Tap the link we sent and they add
            automatically — even on another device.
          </>
        }
        footnote="Held for 15 minutes. You can close this page."
      />
    );
  }

  if (stage === "success" && result) {
    return (
      <EarnCelebration
        points={result.pointsEarned}
        billAmount={result.billAmount}
        balance={result.balance}
        outletName={tenant?.name}
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
        {/* Tenant identity: the logo tile keeps the outlet's true brand colour.
            The points figure below is green, because that's value. */}
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] font-display text-[22px] font-bold"
          style={{ background: "var(--brand)", color: "var(--brand-on)" }}
        >
          {(tenant?.name || "?").charAt(0).toUpperCase()}
        </div>

        <h1 className="font-display text-[22px] font-bold leading-tight text-[var(--ink)]">
          Collect your points at {tenant?.name}
        </h1>
        <p className="mb-6 mt-1.5 text-sm text-[var(--muted)]">
          {mode === "login"
            ? "Sign in to add them to your balance."
            : "Create an account to add them to your balance."}
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
            className="font-bold text-[var(--primary-deep)] hover:underline"
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
      <Button
        type="submit"
        disabled={busy}
        size="lg"
        className="mt-2 w-full"
      >
        {busy ? "Please wait…" : "Sign in & add points"}
      </Button>
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
      <Button
        type="submit"
        disabled={busy}
        size="lg"
        className="mt-2 w-full"
      >
        {busy ? "Please wait…" : "Create account"}
      </Button>
    </form>
  );
}

function ClaimField({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 transition-colors focus-within:border-[var(--primary)]">
      <span>{icon}</span>
      {children}
    </div>
  );
}
