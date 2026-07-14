import React, { createContext, useContext, useState, useEffect } from "react";
import { apiRequest } from "../lib/api";

export interface User {
  id: string;
  name: string;
  role: "customer" | "business_admin" | "platform";
}

interface CustomerAuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerUser: (name: string, email: string, password: string) => Promise<void>;
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
        localStorage.setItem("customer_auth_token", res.token);
        localStorage.setItem("customer_auth_user", JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
      } else {
        throw new Error("Invalid response payload from server.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const registerUser = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>("/api/auth/register", {
        method: "POST",
        body: { name, email, password },
      });

      if (!res.success) {
        throw new Error(res.message || "Failed to register.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("customer_auth_token");
    localStorage.removeItem("customer_auth_user");
    setToken(null);
    setUser(null);
  };

  return (
    <CustomerAuthContext.Provider value={{ user, token, isLoading, login, registerUser, logout }}>
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
