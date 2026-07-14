import React, { createContext, useContext, useState, useEffect } from "react";
import { apiRequest } from "../lib/api";

export interface User {
  id: string;
  name: string;
  role: "customer" | "business_admin" | "platform";
  email?: string;
  emailVerified?: boolean;
}

interface CustomerAuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerUser: (
    name: string,
    email: string,
    password: string,
    phone: string,
    address?: string,
  ) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<{ needsPhone: boolean }>;
  completeProfile: (phone: string, address?: string) => Promise<void>;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("customer_auth_token");
      const storedUser = localStorage.getItem("customer_auth_user");

      if (storedToken && storedUser) {
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        } catch (_) {
          localStorage.removeItem("customer_auth_token");
          localStorage.removeItem("customer_auth_user");
        }
      }
      setIsLoading(false);
    }
  }, []);

  const persist = (t: string, u: User) => {
    localStorage.setItem("customer_auth_token", t);
    localStorage.setItem("customer_auth_user", JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; token: string; user: User }>(
        "/api/auth/login",
        {
          method: "POST",
          body: { email, password },
        },
      );

      if (res.success && res.token && res.user) {
        persist(res.token, res.user);
      } else {
        throw new Error("Invalid response payload from server.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const registerUser = async (
    name: string,
    email: string,
    password: string,
    phone: string,
    address?: string,
  ) => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>("/api/auth/register", {
        method: "POST",
        body: { name, email, password, phone, address },
      });

      if (!res.success) {
        throw new Error(res.message || "Failed to register.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (idToken: string) => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        token: string;
        user: User;
        needsPhone?: boolean;
      }>("/api/auth/google", { method: "POST", body: { idToken } });

      if (!res.success || !res.token || !res.user) {
        throw new Error("Google sign-in failed.");
      }
      persist(res.token, res.user);
      return { needsPhone: Boolean(res.needsPhone) };
    } finally {
      setIsLoading(false);
    }
  };

  const completeProfile = async (phone: string, address?: string) => {
    const res = await apiRequest<{ success: boolean; token: string; user: User }>(
      "/api/auth/complete-profile",
      { method: "POST", body: { phone, address } },
    );
    if (!res.success || !res.token || !res.user) {
      throw new Error("Could not save your details.");
    }
    persist(res.token, res.user);
  };

  const logout = () => {
    localStorage.removeItem("customer_auth_token");
    localStorage.removeItem("customer_auth_user");
    setToken(null);
    setUser(null);
  };

  return (
    <CustomerAuthContext.Provider
      value={{ user, token, isLoading, login, registerUser, loginWithGoogle, completeProfile, logout }}
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
