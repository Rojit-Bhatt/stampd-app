import { useState } from "react";
import { CreditCard } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { AccountSettingsForm } from "../components/shared/AccountSettingsForm";
import { InstallAppPrompt } from "../components/customer/InstallAppPrompt";
import { AvatarPicker } from "../components/customer/AvatarPicker";

const LOGOUT_ANIMATION_MS = 420;

export default function CustomerSettings() {
  const { logout } = useCustomerAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleLogout = () => {
    if (reduceMotion) {
      logout();
      return;
    }
    setLoggingOut(true);
    setTimeout(logout, LOGOUT_ANIMATION_MS);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Profile</h1>
      <p className="mb-6 mt-0.5 text-sm text-[var(--muted)]">Your account details.</p>
      {/* persistent: someone who dismissed the banner on Explore and later
          came looking for it should still find it here. */}
      <InstallAppPrompt className="mb-4" persistent />

      <div className="max-w-[480px]">
        <AvatarPicker className="mb-6" />
      </div>
      <AccountSettingsForm role="customer" onLogout={handleLogout} />

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
