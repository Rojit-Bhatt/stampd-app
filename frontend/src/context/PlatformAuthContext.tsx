import React, { createContext, useContext, useState, useEffect } from "react";
import { apiRequest } from "../lib/api";

export interface PlatformUser {
  id: string;
  name: string;
  role: "customer" | "business_admin" | "platform";
}

interface PlatformAuthContextType {
  user: PlatformUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const PlatformAuthContext = createContext<PlatformAuthContextType | undefined>(undefined);

export function PlatformAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("platform_auth_token");
      const storedUser = localStorage.getItem("platform_auth_user");
      if (storedToken && storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed.role === "platform") {
            setToken(storedToken);
            setUser(parsed);
          } else {
            localStorage.removeItem("platform_auth_token");
            localStorage.removeItem("platform_auth_user");
          }
        } catch (_) {
          localStorage.removeItem("platform_auth_token");
          localStorage.removeItem("platform_auth_user");
        }
      }
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; token: string; user: PlatformUser }>(
        "/api/platform/login",
        { method: "POST", role: "platform", body: { email, password } },
      );
      if (res.success && res.token && res.user) {
        if (res.user.role !== "platform") {
          throw new Error("Access denied: not a platform admin.");
        }
        localStorage.setItem("platform_auth_token", res.token);
        localStorage.setItem("platform_auth_user", JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
      } else {
        throw new Error("Invalid response payload from server.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("platform_auth_token");
    localStorage.removeItem("platform_auth_user");
    setToken(null);
    setUser(null);
  };

  return (
    <PlatformAuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (ctx === undefined) {
    throw new Error("usePlatformAuth must be used within a PlatformAuthProvider");
  }
  return ctx;
}
