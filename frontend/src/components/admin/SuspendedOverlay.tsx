interface SuspendedOverlayProps {
  onLogout: () => void;
}

export function SuspendedOverlay({ onLogout }: SuspendedOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 max-w-sm rounded-[var(--radius-card)] bg-[var(--surface)] p-6 text-center shadow-xl">
        <h2 className="font-display text-xl font-bold text-[var(--ink)]">This business is suspended</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Contact the platform admin to find out why or to request reactivation. You won't be able
          to use the console until then.
        </p>
        <button
          onClick={onLogout}
          className="stamp-interactive mt-5 rounded-full border border-[var(--line)] bg-white px-5 py-2.5 text-sm font-bold"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
