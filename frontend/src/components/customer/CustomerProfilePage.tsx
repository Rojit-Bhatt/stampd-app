import { useState } from "react";
import { CreditCard } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { InstallAppPrompt } from "./InstallAppPrompt";
import { CustomerProfilePanel } from "./CustomerProfilePanel";

const LOGOUT_ANIMATION_MS = 420;

/**
 * The whole Profile screen, shared by the outlet console
 * (`/:company/:outlet/settings`) and `/explore/profile`.
 *
 * One component rather than two similar ones: everything on it is global
 * account state, so there is nothing for a tenant-scoped version to do
 * differently. Where the customer ends up after logging out is the only
 * difference, and each layout's own guard already handles that.
 */
export function CustomerProfilePage({ afterLogout }: { afterLogout?: () => void }) {
  const { logout } = useCustomerAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const reduceMotion = useReducedMotion();

  const finish = () => {
    logout();
    afterLogout?.();
  };

  const handleLogout = () => {
    if (reduceMotion) {
      finish();
      return;
    }
    setLoggingOut(true);
    setTimeout(finish, LOGOUT_ANIMATION_MS);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Profile</h1>
      <p className="mb-6 mt-0.5 text-sm text-[var(--muted)]">Your account details.</p>
      {/* persistent: someone who dismissed the banner on Explore and later
          came looking for it should still find it here. */}
      <InstallAppPrompt className="mb-4" persistent />

      <CustomerProfilePanel onLogout={handleLogout} />

      {/* The card flips away as the session ends. */}
      <AnimatePresence>
        {loggingOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]"
          >
            <motion.div
              initial={{ rotateY: 0, scale: 1 }}
              animate={{ rotateY: 100, scale: 0.85 }}
              transition={{ duration: LOGOUT_ANIMATION_MS / 1000, ease: "easeIn" }}
              className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)]"
              style={{ background: "var(--primary)" }}
            >
              <CreditCard className="h-7 w-7 text-white" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
