import { createFileRoute } from "@tanstack/react-router";
import { AuthView } from "@/components/AuthView";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Sign up — Cafe Coffesarowar" },
      { name: "description", content: "Join the Cafe Coffesarowar loyalty club." },
    ],
  }),
  component: () => <AuthView mode="register" />,
});
