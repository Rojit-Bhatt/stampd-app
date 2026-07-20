import React, { createContext, useContext, useState } from "react";
import { apiRequest, decodeJwtPayload } from "../lib/api";

export interface User {
  id: string;
  name: string;
  role: "customer" | "business_admin" | "platform";
  email?: string;
  emailVerified?: boolean;
}

export interface GlobalAccount {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  /** 0 = no profile picture. Bumped by the backend on every upload/removal. */
  avatarVersion?: number;
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
  login: (email: string, password: string) => Promise<void>;
  registerUser: (
    name: string,
    email: string,
    password: string,
    phone: string,
    pendingClaimId?: string,
    // Proof the caller actually scanned the QR. Register is unauthenticated,
    // so without this a pending claim could be bound by anyone who guessed
    // its id — see pendingClaimService.linkPendingClaimToAccount.
    claimSecret?: string,
  ) => Promise<void>;
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

  const ensureTenantSession = async (_slug: string, tenantOrgId: string | null) => {
    const globalToken = localStorage.getItem("customer_global_session");

    if (globalToken) {
      setIsLoading(true);
      try {
        const storedAccount = localStorage.getItem("customer_global_account");
        if (storedAccount) setGlobalAccount(JSON.parse(storedAccount));

        const res = await apiRequest<{ success: boolean; token: string; user: User }>(
          "/api/customer-auth/enter-tenant",
          { method: "POST", role: "customer-global" },
        );
        if (res.success && res.token && res.user) {
          persistTenant(res.token, res.user);
        }
      } catch {
        // Global session invalid/expired/revoked — drop it and any tenant
        // token, don't silently keep the customer half-signed-in.
        clearGlobal();
        clearTenant();
      } finally {
        setIsLoading(false);
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

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{ success: boolean; token: string; account: GlobalAccount }>(
      "/api/customer-auth/login",
      { method: "POST", body: { email, password } },
    );
    if (!res.success || !res.token || !res.account) {
      throw new Error("Invalid response payload from server.");
    }
    persistGlobal(res.token, res.account);
  };

  const registerUser = async (
    name: string,
    email: string,
    password: string,
    phone: string,
    pendingClaimId?: string,
    claimSecret?: string,
  ) => {
    const res = await apiRequest<{ success: boolean; message: string }>(
      "/api/customer-auth/register",
      { method: "POST", body: { name, email, password, phone, pendingClaimId, claimSecret } },
    );
    if (!res.success) {
      throw new Error(res.message || "Failed to register.");
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
