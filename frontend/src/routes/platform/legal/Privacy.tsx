import { useEffect } from "react";

// Placeholder body. The route exists so the footer links resolve; the copy is
// for the platform owner to write. Both /privacy and /terms are registered in
// backend RESERVED_SLUGS, so no company can claim either slug.
export default function Privacy() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Privacy Policy | Stampd";
    document.documentElement.classList.add("landing-dark");
    return () => {
      document.title = previous;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--lp-bg)] px-6 py-24 md:px-10">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="font-mono text-[11px] tracking-[0.18em] text-[var(--lp-green)]">
          ← STAMPD
        </a>
        <h1 className="mt-6 font-display text-4xl text-[var(--lp-ink)]">Privacy Policy</h1>
        <p className="mt-6 text-base leading-relaxed text-[var(--lp-muted)]">
          We are writing this up properly. In the meantime, if you have a question about
          what we store or how we use it, talk to us and we will answer directly.
        </p>
      </div>
    </main>
  );
}
