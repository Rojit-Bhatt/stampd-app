import React, { createContext, useContext, useState, useEffect } from "react";
import { apiRequest } from "../lib/api";

export interface User {
  id: string;
  name: string;
  role: "customer" | "business_admin" | "platform";
}

interface AdminAuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("admin_auth_token");
      const storedUser = localStorage.getItem("admin_auth_user");
      
      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          if (parsedUser.role === "business_admin") {
            setToken(storedToken);
            setUser(parsedUser);
          } else {
            // Only a tenant's business admin is treated as admin auth.
            localStorage.removeItem("admin_auth_token");
            localStorage.removeItem("admin_auth_user");
          }
        } catch (_) {
          localStorage.removeItem("admin_auth_token");
          localStorage.removeItem("admin_auth_user");
        }
      }
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; token: string; user: User }>(
        "/api/auth/login",
        {
          method: "POST",
          body: { email, password },
          role: "admin"
        }
      );

      if (res.success && res.token && res.user) {
        if (res.user.role !== "business_admin") {
          throw new Error("Access denied: Not a business administrator.");
        }
        localStorage.setItem("admin_auth_token", res.token);
        localStorage.setItem("admin_auth_user", JSON.stringify(res.user));
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
    localStorage.removeItem("admin_auth_token");
    localStorage.removeItem("admin_auth_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AdminAuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
