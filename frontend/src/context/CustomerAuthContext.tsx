import React, { createContext, useContext, useRef, useState } from "react";
import { apiRequest, decodeJwtPayload } from "../lib/api";

export interface User {
  id: string;
  name: string;
  role: "customer" | "business_admin" | "platform";
  email?: string;
  emailVerified?: boolean;
}

export interface MarketingConsentChannel {
  granted: boolean;
  updatedAt: string | null;
}

export interface MarketingConsent {
  email: MarketingConsentChannel;
  sms: MarketingConsentChannel;
  whatsapp: MarketingConsentChannel;
  push: MarketingConsentChannel;
}

export type Gender = "male" | "female" | "other" | "prefer_not_to_say" | null;

export interface GlobalAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  /** 0 = no profile picture. Bumped by the backend on every upload/removal. */
  avatarVersion?: number;
  marketingConsent?: MarketingConsent;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  gender?: Gender;
  /** False for a Google-only signup that never set one. */
  hasPassword: boolean;
}

interface CustomerAuthContextType {
  // Tenant-scoped session for whichever cafe is currently being viewed.
  user: User | null;
  token: string | null;
  isLoading: boolean;
  // The platform-wide identity, shared across every cafe.
  globalAccount: GlobalAccount | null;
  // All four now hit the global /api/customer-auth/* endpoints (there is
  // only one customer auth system going forward) — same method names as
  // before so AuthView/PhoneStepModal barely need to change, just what
  // happens underneath. login/loginWithGoogle only establish the global
  // session; callers must follow up with ensureTenantSession(slug, orgId)
  // to actually enter a specific cafe (exactly what TenantSessionSync
  // already does on every page mount).
  login: (email: string, password: string, turnstileToken?: string) => Promise<void>;
  registerUser: (options: {
    name: string;
    email: string;
    password: string;
    phone: string;
    marketingEmailConsent?: boolean;
    marketingSmsConsent?: boolean;
    pendingClaimId?: string;
    // Proof the caller actually scanned the QR. Register is unauthenticated,
    // so without this a pending claim could be bound by anyone who guessed
    // its id — see pendingClaimService.linkPendingClaimToAccount.
    claimSecret?: string;
    turnstileToken?: string;
    // Only sent by the tenant-scoped register form — the one registration
    // surface with an outlet in scope to check required fields against.
    companySlug?: string;
    outletSlug?: string;
    birthdayMonth?: number;
    birthdayDay?: number;
    gender?: Gender;
  }) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<{ needsPhone: boolean }>;
  completeProfile: (phone: string) => Promise<void>;
  // Silently exchanges an existing global session for a tenant JWT for
  // `slug`, auto-provisioning the membership on first visit; falls back to
  // a cached tenant token only if it actually belongs to this tenant.
  // Called by TenantSessionSync on every /:slug/* page.
  ensureTenantSession: (slug: string, tenantOrgId: string | null) => Promise<void>;
  // Replaces the cached global account after an endpoint returns a fresh one
  // (avatar upload/removal). Keeps the session token as-is: the account is
  // what changed, not who is signed in.
  setGlobalAccountData: (account: GlobalAccount) => void;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // Lazy synchronous read so a slug-less page (no TenantSessionSync mounted
  // to hydrate this from ensureTenantSession) still sees a correct value on
  // first render, e.g. GlobalCustomerLayout's guard on /explore.
  const [globalAccount, setGlobalAccount] = useState<GlobalAccount | null>(() => {
    try {
      const raw = localStorage.getItem("customer_global_account");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // customer_auth_token is a single shared localStorage slot, not one per
  // outlet — TenantSessionSync fires ensureTenantSession on every outlet
  // mount, and rapid navigation between two outlets can leave two of these
  // calls in flight at once. Without this guard, whichever POST resolves
  // last wins the shared token regardless of which outlet is on screen,
  // so a page can end up holding (and querying with) another outlet's JWT.
  // Tracks the most recently REQUESTED outlet so a late-arriving response
  // for an outlet the user has since navigated away from is discarded
  // instead of clobbering the current one.
  const latestTenantRequestRef = useRef<string | null>(null);

  const persistTenant = (t: string, u: User) => {
    localStorage.setItem("customer_auth_token", t);
    localStorage.setItem("customer_auth_user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const clearTenant = () => {
    localStorage.removeItem("customer_auth_token");
    localStorage.removeItem("customer_auth_user");
    setToken(null);
    setUser(null);
  };

  const persistGlobal = (t: string, a: GlobalAccount) => {
    localStorage.setItem("customer_global_session", t);
    localStorage.setItem("customer_global_account", JSON.stringify(a));
    setGlobalAccount(a);
  };

  const clearGlobal = () => {
    localStorage.removeItem("customer_global_session");
    localStorage.removeItem("customer_global_account");
    setGlobalAccount(null);
  };

  // Reads the customer_auth_token slot synchronously — used below to decide
  // whether an exchange is even needed, without waiting for React state.
  const readCachedTenantToken = (): string | null =>
    localStorage.getItem("customer_auth_token");

  const ensureTenantSession = async (_slug: string, tenantOrgId: string | null) => {
    const requestKey = tenantOrgId || _slug;
    latestTenantRequestRef.current = requestKey;
    const globalToken = localStorage.getItem("customer_global_session");

    // The app keeps ONE shared tenant-JWT slot across every outlet. If the
    // cached JWT belongs to a DIFFERENT outlet than the one on screen, this
    // page's data queries would hit the wrong tenant (backend scopes by the
    // JWT, never the URL) and the sessionStale gate in CustomerLayout would
    // show the full-screen spinner until a re-fire happened. But the effect
    // that re-fires this function (TenantSessionSync's tenant.id change)
    // does NOT fire on a second visit to an outlet the customer already
    // opened — its tenant query result is identical to the first visit, so
    // nothing ever kicked off recovery: the spinner stayed forever.
    //
    // Fix: treat "stored JWT belongs to the wrong tenant" as an active
    // recovery path, exactly like an absent JWT. With a valid global
    // session, exchanging for a fresh tenant JWT is free and fast — do it
    // here, don't wait for anything else to re-trigger it. (Backend
    // regression: tests/outlet-switch-stuck-loader.js.)
    if (globalToken) {
      const cachedToken = readCachedTenantToken();
      const payload = cachedToken ? decodeJwtPayload(cachedToken) : null;
      const cachedOrgId = payload?.organizationId || null;
      // Skip the (relatively cheap) exchange when the cached JWT already
      // belongs to this tenant — the customer just switches back and forth,
      // and re-POSTing on every open would waste round-trips and hit the
      // latestTenantRequestRef race window for no gain.
      const needExchange = !cachedOrgId || cachedOrgId !== tenantOrgId;
      if (!needExchange) {
        const cachedUser = localStorage.getItem("customer_auth_user");
        if (cachedUser) {
          try {
            setUser(JSON.parse(cachedUser));
          } catch {
            clearTenant();
          }
        }
        setToken(cachedToken);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const storedAccount = localStorage.getItem("customer_global_account");
        if (storedAccount) setGlobalAccount(JSON.parse(storedAccount));

        const res = await apiRequest<{ success: boolean; token: string; user: User }>(
          "/api/customer-auth/enter-tenant",
          { method: "POST", role: "customer-global" },
        );
        // The user may have navigated to a different outlet while this was
        // in flight — a newer ensureTenantSession call has since become the
        // latest request. Applying this response now would attach the
        // outlet this call was FOR onto the outlet now on screen.
        if (latestTenantRequestRef.current !== requestKey) return;
        if (res.success && res.token && res.user) {
          persistTenant(res.token, res.user);
        }
      } catch (err) {
        // Global session invalid/expired/revoked — drop it and any tenant
        // token, don't silently keep the customer half-signed-in. Only act
        // if this is still the latest request; a stale failure must not
        // clear a session a newer, successful request just established.
        if (latestTenantRequestRef.current !== requestKey) return;
        const status = (err as any).status;
        if (status === 401 || status === 403) {
          clearGlobal();
          clearTenant();
        }
        throw err;
      } finally {
        if (latestTenantRequestRef.current === requestKey) setIsLoading(false);
      }
      return;
    }

    // No global session (pre-migration device, or never logged in) — only
    // trust a cached tenant token if its embedded organizationId actually
    // matches the tenant being viewed; otherwise it's a stale token from a
    // different cafe and must not be silently reused.
    const cachedToken = localStorage.getItem("customer_auth_token");
    const cachedUser = localStorage.getItem("customer_auth_user");

    if (cachedToken && cachedUser) {
      const payload = tenantOrgId ? decodeJwtPayload(cachedToken) : null;
      if (tenantOrgId && payload?.organizationId && payload.organizationId !== tenantOrgId) {
        clearTenant();
        setIsLoading(false);
        return;
      }
      try {
        setToken(cachedToken);
        setUser(JSON.parse(cachedUser));
      } catch {
        clearTenant();
      }
    }
    setIsLoading(false);
  };

  const login = async (email: string, password: string, turnstileToken?: string) => {
    const res = await apiRequest<{ success: boolean; token: string; account: GlobalAccount }>(
      "/api/customer-auth/login",
      { method: "POST", body: { email, password, turnstileToken } },
    );
    if (!res.success || !res.token || !res.account) {
      throw new Error("Invalid response payload from server.");
    }
    persistGlobal(res.token, res.account);
  };

  const registerUser = async (options: {
    name: string; email: string; password: string; phone: string;
    marketingEmailConsent?: boolean; marketingSmsConsent?: boolean;
    pendingClaimId?: string; claimSecret?: string;
    companySlug?: string; outletSlug?: string;
    birthdayMonth?: number; birthdayDay?: number; gender?: Gender;
  }) => {
    const res = await apiRequest<{ success: boolean; token?: string; account?: GlobalAccount; message: string }>(
      "/api/customer-auth/register",
      { method: "POST", body: options },
    );
    if (!res.success) {
      throw new Error(res.message || "Failed to register.");
    }
    if (res.token && res.account) {
      persistGlobal(res.token, res.account);
    }
  };

  const loginWithGoogle = async (idToken: string) => {
    const res = await apiRequest<{
      success: boolean;
      token: string;
      account: GlobalAccount;
      needsPhone?: boolean;
    }>("/api/customer-auth/google", { method: "POST", body: { idToken } });

    if (!res.success || !res.token || !res.account) {
      throw new Error("Google sign-in failed.");
    }
    persistGlobal(res.token, res.account);
    return { needsPhone: Boolean(res.needsPhone) };
  };

  const completeProfile = async (phone: string) => {
    const res = await apiRequest<{ success: boolean; token: string; account: GlobalAccount }>(
      "/api/customer-auth/complete-profile",
      { method: "POST", role: "customer-global", body: { phone } },
    );
    if (!res.success || !res.token || !res.account) {
      throw new Error("Could not save your details.");
    }
    persistGlobal(res.token, res.account);
  };

  const setGlobalAccountData = (account: GlobalAccount) => {
    localStorage.setItem("customer_global_account", JSON.stringify(account));
    setGlobalAccount(account);
  };

  const logout = () => {
    clearGlobal();
    clearTenant();
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        globalAccount,
        login,
        registerUser,
        loginWithGoogle,
        completeProfile,
        ensureTenantSession,
        setGlobalAccountData,
        logout,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (context === undefined) {
    throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  }
  return context;
}
