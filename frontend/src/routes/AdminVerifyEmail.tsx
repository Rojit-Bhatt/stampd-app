import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { PLATFORM_NAME } from "../lib/platform";
import { StampdLogo } from "../components/shared/StampdLogo";

interface VerifyResponse {
  success: boolean;
  message: string;
}

// Same StrictMode-safe module-scope promise cache as GlobalVerifyEmail.tsx —
// verification tokens are single-use, so a duplicate mount must reuse the
// same in-flight/settled request rather than burn a second one.
const verifyRequests = new Map<string, Promise<VerifyResponse>>();

function verifyOnce(token: string) {
  let promise = verifyRequests.get(token);
  if (!promise) {
    promise = apiRequest<VerifyResponse>(
      `/api/admin-auth/verify-email?token=${encodeURIComponent(token)}`,
    );
    verifyRequests.set(token, promise);
  }
  return promise;
}

// Where the staff verification email lands. Slug-less, like the login it
// leads to: the token identifies the AdminAccount, and a company owner has
// no outlet to be scoped to anyway.
//
// This route existing is load-bearing: an unverified admin is refused AT
// login with 403, so without it a new admin is locked out permanently with
// no recovery path.
export default function AdminVerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    document.title = `Verify your email | ${PLATFORM_NAME}`;
  }, []);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMsg("This link is missing its verification token — check the email again.");
      return;
    }

    verifyOnce(token)
      .then((r) => {
        setState("ok");
        setMsg(r.message || "You're verified — sign in and you're away.");
      })
      .catch((e) => {
        setState("error");
        setMsg((e as Error).message || "Couldn't verify that link. It may have expired.");
      });
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm text-center">
        <StampdLogo size={44} tile className="mx-auto mb-3.5" />
        {state === "loading" ? (
          <p className="text-sm text-[var(--muted)]">Verifying…</p>
        ) : (
          <>
            <h2 className="font-display text-[22px] font-bold text-[var(--ink)]">
              {state === "ok" ? "Email verified" : "Verification failed"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{msg}</p>
            <Link
              to="/admin-login"
              className="stamp-interactive mt-5 inline-block rounded-[var(--radius-btn)] px-6 py-3 text-sm font-bold text-white"
              style={{ background: "var(--primary)" }}
            >
              {state === "ok" ? "Sign in" : "Back to sign in"}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
