import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiRequest } from "../lib/api";

// Verify tokens are single-use, so firing the request twice for the same
// token would 400 on the second call even though the first succeeded. In
// development, React 18 StrictMode intentionally mounts every component
// twice (mount -> unmount -> remount) to surface missing cleanup — each
// mount gets a fresh component instance, so a ref or state guard inside the
// component can't survive it. Caching the in-flight/settled promise at
// module scope (outside the component) does: every mount for the same
// token reuses the same promise instead of issuing a new request.
const verifyRequests = new Map<string, Promise<{ success: boolean; message: string }>>();

function verifyOnce(token: string) {
  let promise = verifyRequests.get(token);
  if (!promise) {
    promise = apiRequest<{ success: boolean; message: string }>(
      `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
    );
    verifyRequests.set(token, promise);
  }
  return promise;
}

export default function VerifyEmail() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");

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
            <Link
              to={`/${slug}/login`}
              className="mt-5 inline-block rounded-[13px] px-6 py-3 text-sm font-bold text-white"
              style={{ background: "var(--brand)" }}
            >
              Continue to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
