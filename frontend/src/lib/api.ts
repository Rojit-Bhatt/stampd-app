const API_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  (typeof window !== "undefined" ? "" : "http://localhost:5001");

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

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: any;
  role?: "admin" | "customer" | "platform" | "customer-global" | "company";
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${API_URL}${path}`;

  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (currentTenantRef && !headers.has("X-Company-Slug")) {
    headers.set("X-Company-Slug", currentTenantRef.company);
    headers.set("X-Outlet-Slug", currentTenantRef.outlet);
  }

  if (typeof window !== "undefined") {
    // Determine which token to send based on path or explicit role option
    const role =
      options.role ||
      (path.startsWith("/api/platform")
        ? "platform"
        : path.startsWith("/api/admin")
          ? "admin"
          : "customer");
    const tokenKey =
      role === "platform"
        ? "platform_auth_token"
        : role === "admin"
          ? "admin_auth_token"
          : role === "customer-global"
            ? "customer_global_session"
            : role === "company"
              ? "company_session"
              : "customer_auth_token";
    const token = localStorage.getItem(tokenKey);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const { body, role, ...restOptions } = options;

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
