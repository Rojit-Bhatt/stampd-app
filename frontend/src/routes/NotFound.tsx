import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ink)] px-4 font-sans text-[var(--bg)]">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-[var(--bg)] font-serif">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-[var(--bg)] font-serif">Page not found</h2>
        <p className="mt-2 text-sm text-[#A3A3A3]">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-[var(--bg)] text-black px-4 py-2 text-sm font-medium transition-colors hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
