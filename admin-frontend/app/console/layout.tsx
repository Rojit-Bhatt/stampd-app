'use client';

import React from "react";
import { AdminGuard } from "@/components/AdminGuard";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
