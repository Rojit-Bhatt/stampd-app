import React, { createContext, useContext, useState } from "react";
import { apiRequest } from "../lib/api";

export interface OwnerAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
}

interface OwnerAuthContextType {
  account: OwnerAccount | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerOwner: (name: string, email: string, password: string, phone: string) => Promise<void>;
  logout: () => void;
}

const OwnerAuthContext = createContext<OwnerAuthContextType | undefined>(undefined);

export function OwnerAuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<OwnerAccount | null>(() => {
    try {
      const raw = localStorage.getItem("owner_global_account");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  const persist = (token: string, acc: OwnerAccount) => {
    localStorage.setItem("owner_global_session", token);
    localStorage.setItem("owner_global_account", JSON.stringify(acc));
    setAccount(acc);
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; token: string; account: OwnerAccount }>(
        "/api/owner/login",
        { method: "POST", body: { email, password } },
      );
      if (!res.success || !res.token || !res.account) {
        throw new Error("Invalid response payload from server.");
      }
      persist(res.token, res.account);
    } finally {
      setIsLoading(false);
    }
  };

  const registerOwner = async (name: string, email: string, password: string, phone: string) => {
    const res = await apiRequest<{ success: boolean; message: string }>(
      "/api/owner/register",
      { method: "POST", body: { name, email, password, phone } },
    );
    if (!res.success) {
      throw new Error(res.message || "Failed to register.");
    }
  };

  const logout = () => {
    localStorage.removeItem("owner_global_session");
    localStorage.removeItem("owner_global_account");
    setAccount(null);
  };

  return (
    <OwnerAuthContext.Provider value={{ account, isLoading, login, registerOwner, logout }}>
      {children}
    </OwnerAuthContext.Provider>
  );
}

export function useOwnerAuth() {
  const context = useContext(OwnerAuthContext);
  if (context === undefined) {
    throw new Error("useOwnerAuth must be used within an OwnerAuthProvider");
  }
  return context;
}
