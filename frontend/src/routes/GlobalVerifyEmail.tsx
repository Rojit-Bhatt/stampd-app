import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../lib/api";

interface FulfilledClaim {
  organizationId: string;
  organizationName: string;
  pointsEarned: number;
  billAmount: number;
  balance: number;
}

interface VerifyResponse {
  success: boolean;
  message: string;
  fulfilled: FulfilledClaim[];
}

// Same StrictMode-safe module-scope promise cache as the tenant-scoped
// VerifyEmail.tsx — verification tokens are single-use, so a duplicate
// mount must reuse the same in-flight/settled request rather than re-fire.
const verifyRequests = new Map<string, Promise<VerifyResponse>>();

function verifyOnce(token: string) {
  let promise = verifyRequests.get(token);
  if (!promise) {
    promise = apiRequest<VerifyResponse>(
      `/api/customer-auth/verify-email?token=${encodeURIComponent(token)}`,
    );
    verifyRequests.set(token, promise);
  }
  return promise;
}

// Global (slug-less) counterpart to VerifyEmail.tsx — verifies the account
// itself, not a tenant membership, and reports every claim that was left
// pending on a QR scan made before verification finished.
export default function GlobalVerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [fulfilled, setFulfilled] = useState<FulfilledClaim[]>([]);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMsg("Missing verification token.");
      return;
    }

    verifyOnce(token)
      .then((r) => {
        setState("ok");
        setMsg(r.message);
        setFulfilled(r.fulfilled || []);
      })
      .catch((e) => {
        setState("error");
        setMsg((e as Error).message || "Verification failed.");
      });
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm text-center">
        {state === "loading" ? (
          <p className="text-sm text-[var(--muted)]">Verifying…</p>
        ) : (
          <>
            <h2 className="font-display text-[22px] font-extrabold text-[var(--ink)]">
              {state === "ok" ? "Email verified" : "Verification failed"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{msg}</p>

            {fulfilled.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 text-left">
                {fulfilled.map((f) => (
                  <div
                    key={f.organizationId}
                    className="rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm"
                  >
                    <span className="font-bold text-[var(--ink)]">{f.organizationName}</span>
                    <span className="text-[var(--muted)]">
                      {" "}
                      — {f.pointsEarned} points added
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Link
              to="/"
              className="mt-5 inline-block rounded-[13px] px-6 py-3 text-sm font-bold text-white"
              style={{ background: "var(--brand)" }}
            >
              Continue
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
