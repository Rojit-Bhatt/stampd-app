import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Phone, Timer, AlertTriangle, Check, WifiOff } from "lucide-react";
import toast from "@/lib/toast";
import { apiRequest } from "../lib/api";
import { useTenant } from "../context/TenantContext";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { useCelebration } from "../context/CelebrationContext";
import { GoogleLogin } from "@react-oauth/google";
import { PhoneStepModal } from "../components/customer/PhoneStepModal";
import { ClaimStateScreen } from "../components/customer/ClaimStateScreen";
import { formatPoints } from "../hooks/usePoints";
import { tenantPath } from "../lib/tenantPath";
import { Button } from "@/components/ui/button";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

type Stage =
  | "resolving"
  | "checking"
  | "fulfilling"
  | "choose"
  | "awaiting-verification"
  | "success"
  | "error";

type ClaimFailure = "expired" | "already-used" | "already-added" | "session-expired" | "offline" | "unknown";

function classifyFailure(err: Error & { code?: string; status?: number }): ClaimFailure {
  if (err.code === "CLAIM_ALREADY_FULFILLED") return "already-added";
  if (!navigator.onLine || err.name === "TypeError") return "offline";
  if (err.status === 401) return "session-expired";
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
  const { user, isLoading, ensureTenantSession, login, registerUser, loginWithGoogle } = useCustomerAuth();
  const { showEarn } = useCelebration();

  const [stage, setStage] = useState<Stage>("resolving");
  const [errorMsg, setErrorMsg] = useState("");
  const [failure, setFailure] = useState<ClaimFailure>("unknown");
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [claimSecret, setClaimSecret] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [showPhoneStep, setShowPhoneStep] = useState(false);
  const checkedOnce = useRef(false);

  const tokenParam = params.get("token");
  useEffect(() => {
    if (!tokenParam) {
      setStage("error");
      setErrorMsg("Missing QR token.");
      return;
    }
    startClaimOnce(tokenParam)
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
  }, [tokenParam]);

  useEffect(() => {
    if (stage !== "checking" || isLoading || checkedOnce.current) return;
    checkedOnce.current = true;
    setStage(user ? "fulfilling" : "choose");
  }, [stage, isLoading, user]);

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
        showEarn({
          points: res.data.pointsEarned ?? 0,
          billAmount: res.data.billAmount ?? 0,
          balance: res.data.balance ?? 0,
          outletName: tenant?.name,
          multiplier: res.data.multiplier,
          campaignName: res.data.campaignName,
        });
        setStage("success");
        navigate(tenantPath(companySlug, slug, "dashboard"));
        return true;
      }
      if (res.data.expired && expiredMessage) {
        setStage("error");
        setErrorMsg(expiredMessage);
        return true;
      }
    } catch {
      // transient
    }
    return false;
  };

  const fulfillingRef = useRef(false);

  const fulfill = async (claimId: string) => {
    if (fulfillingRef.current) return;
    fulfillingRef.current = true;
    setStage("fulfilling");
    try {
      const res = await apiRequest<{ success: boolean; data: ClaimResult }>(
        `/api/claim/${claimId}/fulfill`,
        { method: "POST", body: { claimSecret } },
      );
      setResult(res.data);
      showEarn({
        points: res.data.pointsEarned,
        billAmount: res.data.billAmount,
        balance: res.data.balance,
        outletName: tenant?.name,
        multiplier: res.data.multiplier,
        campaignName: res.data.campaignName,
      });
      setStage("success");
      navigate(tenantPath(companySlug, slug, "dashboard"));
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "CLAIM_ALREADY_FULFILLED") {
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
    } finally {
      fulfillingRef.current = false;
    }
  };

  useEffect(() => {
    if (stage === "fulfilling" && pendingClaimId) {
      fulfill(pendingClaimId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pendingClaimId]);

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
      if (pendingClaimId) setStage("fulfilling");
    } catch (e) {
      toast.error((e as Error).message || "Couldn't sign you in — try again.");
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async (name: string, email: string, password: string, phone: string) => {
    setBusy(true);
    try {
      await registerUser({
        name, email, password, phone,
        pendingClaimId: pendingClaimId ?? undefined,
        claimSecret: claimSecret ?? undefined,
      });
      await ensureTenantSession(slug, tenant?.id ?? null);
      if (pendingClaimId) {
        setStage("fulfilling");
      } else {
        navigate(tenantPath(companySlug, slug, "dashboard"));
      }
    } catch (e) {
      toast.error((e as Error).message || "Couldn't create your account — try again.");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async (credential?: string) => {
    if (!credential) return;
    setBusy(true);
    try {
      const { needsPhone } = await loginWithGoogle(credential);
      await ensureTenantSession(slug, tenant?.id ?? null);
      if (needsPhone) {
        setShowPhoneStep(true);
      } else {
        if (pendingClaimId) {
          setStage("fulfilling");
        }
      }
    } catch (err) {
      toast.error((err as Error).message || "Google sign-in didn't work — try again.");
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

    if (failure === "session-expired") {
      return (
        <ClaimStateScreen
          icon={<Lock className="h-6 w-6" />}
          tone="warn"
          title="Sign in again"
          body="Your sign-in has expired. Your claim is still held — sign back in and we'll finish it."
          primary={{
            label: "Sign in",
            onClick: () => {
              checkedOnce.current = true;
              setMode("login");
              setStage("choose");
            },
          }}
          secondary={{ label: backLabel, to: home }}
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
        title="Verify your email"
        body="We sent a verification link to your email. Open it to finish signing in — we'll add your points the moment you do."
        primary={{
          label: "I've verified — check now",
          onClick: () => {
            if (pendingClaimId) checkStatus(pendingClaimId);
          },
        }}
        secondary={{ label: `Back to ${tenant?.name || "home"}`, to: tenantPath(companySlug, slug) }}
      />
    );
  }

  if (stage === "success") {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[var(--bg)] px-6 py-10 text-[var(--ink)]">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">
            {tenant?.name ? `You're at ${tenant.name}` : "Claim your points"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Sign in or create an account to collect points.</p>
        </div>

        <div className="mt-8 flex rounded-[var(--radius-btn)] bg-[var(--surface-2)] p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-[calc(var(--radius-btn)-2px)] py-2 text-sm font-bold transition-all ${
              mode === "login" ? "bg-[var(--surface)] text-[var(--ink)] shadow-ambient" : "text-[var(--muted)]"
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 rounded-[calc(var(--radius-btn)-2px)] py-2 text-sm font-bold transition-all ${
              mode === "register" ? "bg-[var(--surface)] text-[var(--ink)] shadow-ambient" : "text-[var(--muted)]"
            }`}
          >
            Create account
          </button>
        </div>

        {GOOGLE_CLIENT_ID && (
          <div className="mt-6">
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={(res) => onGoogle(res.credential)}
                onError={() => toast.error("Google sign-in failed.")}
                useOneTap={false}
                shape="rectangular"
                size="large"
                width="100%"
              />
            </div>
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--line)]" />
              </div>
              <span className="relative bg-[var(--bg)] px-3 text-xs uppercase tracking-wider text-[var(--muted)]">
                Or with email
              </span>
            </div>
          </div>
        )}

        {mode === "login" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const email = (form.elements.namedItem("email") as HTMLInputElement).value;
              const password = (form.elements.namedItem("password") as HTMLInputElement).value;
              onLogin(email, password);
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full rounded-[var(--radius-btn)] bg-[var(--primary)] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in & claim points"}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = (form.elements.namedItem("name") as HTMLInputElement).value;
              const email = (form.elements.namedItem("email") as HTMLInputElement).value;
              const password = (form.elements.namedItem("password") as HTMLInputElement).value;
              const phone = (form.elements.namedItem("phone") as HTMLInputElement).value;
              onRegister(name, email, password, phone);
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="Alex Smith"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  name="phone"
                  type="tel"
                  required
                  placeholder="98XXXXXXXX"
                  className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full rounded-[var(--radius-btn)] bg-[var(--primary)] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating account…" : "Create account & claim points"}
            </Button>
          </form>
        )}
      </div>

      <div className="mt-8 text-center text-xs text-[var(--muted)]">
        Powered by Stampd
      </div>

      {showPhoneStep && (
        <PhoneStepModal
          onDone={() => {
            setShowPhoneStep(false);
            if (pendingClaimId) {
              setStage("fulfilling");
            }
          }}
        />
      )}
    </div>
  );
}
