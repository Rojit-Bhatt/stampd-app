const API_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  (typeof window !== "undefined" ? "" : "http://localhost:5001");

// Prefixes a path with the API base. In dev/local this is "" (relative — the
// Vite dev proxy forwards /api to the backend); in production it's the
// backend's absolute URL from VITE_API_BASE_URL, since the frontend is served
// from a different origin (Cloudflare Pages) than the API (Render). Use this
// at the raw-fetch file-download call sites — apiRequest already applies it
// internally, but those sites bypass apiRequest to read a binary blob.
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

// The active company+outlet pair for the current request context.
// TenantProvider sets this from the URL (`/:company/:outlet/...`) so every
// request carries both slugs. An outlet slug is only unique WITHIN its
// company, so both are always required to identify a tenant.
//
// Public routes (register/login, /api/tenant, /api/menu) resolve the tenant
// from these headers; authenticated loyalty routes ignore them and take the
// tenant from the JWT.
export interface TenantRef {
  company: string;
  outlet: string;
}

let currentTenantRef: TenantRef | null = null;

export function setTenantRef(ref: TenantRef | null) {
  currentTenantRef = ref
    ? { company: ref.company.trim().toLowerCase(), outlet: ref.outlet.trim().toLowerCase() }
    : null;
}

export function getTenantRef() {
  return currentTenantRef;
}

// The tenant headers as a plain object, for the handful of file-download
// call sites that use raw fetch (to read a blob) rather than apiRequest.
export function tenantHeaders(): Record<string, string> {
  if (!currentTenantRef) return {};
  return {
    "X-Company-Slug": currentTenantRef.company,
    "X-Outlet-Slug": currentTenantRef.outlet,
  };
}

// Display-only decode (no signature verification) of a JWT's payload —
// used to detect a cached tenant token that belongs to a different tenant
// than the one currently being viewed, so it can be dropped instead of
// silently misused. Never trust this for anything security-relevant; the
// backend always re-verifies the real signature.
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

// Display-only expiry check on a cached JWT, same caveat as decodeJwtPayload:
// the server is the authority. This exists so the client stops REUSING a
// token it can already see is dead — a tenant JWT lives 7 days, the global
// session 14, and reusing an expired tenant JWT for those extra days made
// every customer call 401: zero balance on the dashboard, "sign in again" on
// every QR claim, and signing in again didn't help because the same dead
// token was picked straight back up. A small skew treats "about to expire"
// as expired, so a token doesn't die between this check and the request.
export function isJwtExpired(token: string | null | undefined, skewSeconds = 30): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  if (typeof payload.exp !== "number") return false;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}

// One recovery attempt for a customer request the server rejected with 401.
// CustomerAuthContext registers this: with a live global session it
// re-exchanges for a fresh tenant JWT (resolving to true so the request is
// retried once); otherwise it drops the dead tenant token and resolves false.
// Concurrent 401s (a dashboard fires several queries at once) share one
// exchange instead of each POSTing enter-tenant.
let customerUnauthorizedHandler: (() => Promise<boolean>) | null = null;
let customerRecovery: Promise<boolean> | null = null;

export function setCustomerUnauthorizedHandler(handler: (() => Promise<boolean>) | null) {
  customerUnauthorizedHandler = handler;
}

function recoverCustomerSession(): Promise<boolean> {
  if (!customerUnauthorizedHandler) return Promise.resolve(false);
  if (!customerRecovery) {
    customerRecovery = customerUnauthorizedHandler()
      .catch(() => false)
      .finally(() => {
        customerRecovery = null;
      });
  }
  return customerRecovery;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: any;
  role?: "admin" | "customer" | "platform" | "customer-global" | "company";
  /** Internal: set on the single retry after a 401 recovery. */
  _retried?: boolean;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = apiUrl(path);

  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (currentTenantRef && !headers.has("X-Company-Slug")) {
    headers.set("X-Company-Slug", currentTenantRef.company);
    headers.set("X-Outlet-Slug", currentTenantRef.outlet);
  }

  // Determine which token to send based on path or explicit role option
  const effectiveRole =
    options.role ||
    (path.startsWith("/api/platform")
      ? "platform"
      : path.startsWith("/api/admin")
        ? "admin"
        : "customer");

  // Whether this request carried a tenant JWT — the only kind of 401 the
  // recovery below can do anything about.
  let sentTenantToken = false;

  if (typeof window !== "undefined") {
    const tokenKey =
      effectiveRole === "platform"
        ? "platform_auth_token"
        : effectiveRole === "admin"
          ? "admin_auth_token"
          : effectiveRole === "customer-global"
            ? "customer_global_session"
            : effectiveRole === "company"
              ? "company_session"
              : "customer_auth_token";
    const token = localStorage.getItem(tokenKey);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      sentTenantToken = tokenKey === "customer_auth_token";
    }
  }

  const { body, role, _retried, ...restOptions } = options;

  const config: RequestInit = {
    ...restOptions,
    headers,
  };

  if (body) {
    if (body instanceof FormData || typeof body === "string") {
      config.body = body;
    } else {
      config.body = JSON.stringify(body);
    }
  }

  const response = await fetch(url, config);

  // A tenant-JWT request the server refused: recover the session once and
  // retry, instead of letting the caller render a dead token as "0 points"
  // or "sign in again". Only when a tenant JWT was actually sent (a wrong
  // password on /api/customer-auth/login is a 401 too, and is a real
  // answer), never for the global/admin/platform slots, and never twice.
  // Auth endpoints (login, register, verify, reset) answer 401 for bad
  // credentials whatever token rides along, so they are excluded outright.
  const isAuthEndpoint = path.startsWith("/api/customer-auth/") || path.startsWith("/api/auth/");
  if (response.status === 401 && sentTenantToken && !isAuthEndpoint && !_retried) {
    const recovered = await recoverCustomerSession();
    if (recovered) {
      return apiRequest<T>(path, { ...options, _retried: true });
    }
  }

  if (!response.ok) {
    let errorMsg = "Something went wrong";
    let errCode: string | undefined;
    try {
      const errJson = await response.json();
      errorMsg = errJson.message || errorMsg;
      errCode = errJson.code;
    } catch (_) {
      // ignore
    }
    const error = new Error(errorMsg) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = errCode;
    throw error;
  }

  try {
    return (await response.json()) as T;
  } catch (_) {
    return {} as T;
  }
}

// Ported admin endpoints
export interface QrTokenResponse {
  success: boolean;
  data: { token: string; purpose: "earn" | "redeem"; billAmount?: number; expiresInSeconds: number };
}

// A bill is mandatory: points are a percentage of what was actually paid,
// so the server refuses a bill-less earn token rather than awarding zero.
export async function generateQr(billAmount: number) {
  return apiRequest<QrTokenResponse>("/api/admin/generate-qr", {
    method: "POST",
    body: { billAmount },
    role: "admin",
  });
}

// Redemption is staff-initiated too — a customer must never be able to move
// their own balance. The customer picks the reward after scanning.
export async function generateRedeemQr() {
  return apiRequest<QrTokenResponse>("/api/admin/generate-redeem-qr", {
    method: "POST",
    role: "admin",
  });
}
