import { createFileRoute } from "@tanstack/react-router";
import { AuthView } from "@/components/AuthView";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — Cafe Coffesarowar" },
      { name: "description", content: "Log in to your Cafe Coffesarowar loyalty account." },
    ],
  }),
  component: () => <AuthView mode="login" />,
});
