// Drop-in replacement for react-hot-toast's `toast` + `<Toaster>`.
//
// Same imperative API the app already calls everywhere
// (`toast.success/error/loading/dismiss`, `toast(msg)`, and the `{ id }`
// update option), backed by our own motion.dev-style stacked toasts instead
// of react-hot-toast. Swapping the import specifier to `@/lib/toast` was the
// whole migration — no call site changed.
//
// Design rule carried from the 2026 redesign: success and error share ONE
// neutral surface/ink card and differ by ICON SHAPE only. No green, no red.
import {
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X, Loader2, Info } from "lucide-react";

import { useMotion } from "./motion";

type ToastType = "success" | "error" | "loading" | "blank";

interface ToastRecord {
  id: string;
  type: ToastType;
  message: ReactNode;
  duration: number; // ms; Infinity = sticky (loading)
}

interface ToastOptions {
  id?: string;
  duration?: number;
}

const DEFAULTS: Record<ToastType, number> = {
  success: 3500,
  error: 4500,
  blank: 3500,
  loading: Infinity,
};

// ---- store ---------------------------------------------------------------

let toasts: ToastRecord[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;

function emit() {
  // New array identity so useSyncExternalStore sees the change.
  toasts = [...toasts];
  listeners.forEach((l) => l());
}

function clearTimer(id: string) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

function scheduleDismiss(id: string, duration: number) {
  clearTimer(id);
  if (duration !== Infinity && duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), duration),
    );
  }
}

function upsert(type: ToastType, message: ReactNode, opts?: ToastOptions): string {
  const id = opts?.id ?? `t${++counter}`;
  const duration = opts?.duration ?? DEFAULTS[type];
  const existing = toasts.find((t) => t.id === id);
  if (existing) {
    existing.type = type;
    existing.message = message;
    existing.duration = duration;
  } else {
    toasts.push({ id, type, message, duration });
  }
  scheduleDismiss(id, duration);
  emit();
  return id;
}

function dismiss(id?: string) {
  if (id === undefined) {
    timers.forEach((_, key) => clearTimer(key));
    toasts = [];
  } else {
    clearTimer(id);
    toasts = toasts.filter((t) => t.id !== id);
  }
  emit();
}

// ---- public API (react-hot-toast shape) ----------------------------------

interface ToastFn {
  (message: ReactNode, opts?: ToastOptions): string;
  success: (message: ReactNode, opts?: ToastOptions) => string;
  error: (message: ReactNode, opts?: ToastOptions) => string;
  loading: (message: ReactNode, opts?: ToastOptions) => string;
  dismiss: (id?: string) => void;
  remove: (id?: string) => void;
}

const toast = ((message: ReactNode, opts?: ToastOptions) =>
  upsert("blank", message, opts)) as ToastFn;
toast.success = (message, opts) => upsert("success", message, opts);
toast.error = (message, opts) => upsert("error", message, opts);
toast.loading = (message, opts) => upsert("loading", message, opts);
toast.dismiss = dismiss;
toast.remove = dismiss;

export default toast;

// ---- viewport ------------------------------------------------------------

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return toasts;
}

function ToastIcon({ type }: { type: ToastType }) {
  const base = "h-4 w-4 flex-shrink-0";
  if (type === "success") return <Check className={base} strokeWidth={3} />;
  if (type === "error") return <X className={base} strokeWidth={3} />;
  if (type === "loading")
    return <Loader2 className={`${base} animate-spin`} strokeWidth={2.4} />;
  return <Info className={base} strokeWidth={2.4} />;
}

// Newest toast sits closest to the corner; older ones stack behind it and
// lift away. `layout` animates the reflow when one is dismissed. Bottom-right,
// matching the old Toaster position.
export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot);
  const m = useMotion();
  // Cap what's on screen; newest last in array -> render reversed so newest
  // is at the bottom (nearest the corner).
  const visible = items.slice(-4);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:right-0 sm:left-auto sm:max-w-sm">
      <AnimatePresence mode="popLayout">
        {visible.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: m.prefersReduced ? { duration: 0 } : { duration: 0.15 } }}
            transition={m.spring("settle")}
            className="pointer-events-auto flex w-full items-center gap-2.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--ink)] shadow-float"
            role="status"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--ink)]">
              <ToastIcon type={t.type} />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
              {t.message}
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[var(--soft)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
