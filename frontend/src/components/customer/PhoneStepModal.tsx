import { useState } from "react";
import toast from "react-hot-toast";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { Button } from "@/components/ui/button";

// Shown after a Google sign-in when the customer has no phone yet. Phone is a
// required field on customer accounts, but Google returns only an email — so
// we collect it here (no OTP) to complete the profile.
export function PhoneStepModal({ onDone }: { onDone: () => void }) {
  const { completeProfile } = useCustomerAuth();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const local = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (local.length < 7) {
      toast.error("That phone number doesn't look right.");
      return;
    }
    setBusy(true);
    try {
      await completeProfile(`+977${local}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-modal">
        <h3 className="font-display text-lg font-bold text-[var(--ink)]">One more thing</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">Add your phone number to finish.</p>
        <div className="mt-4 flex items-center rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3">
          <span className="text-sm text-[var(--soft)]">+977</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            placeholder="98XXXXXXXX"
            className="flex-1 bg-transparent px-2 py-3 text-sm text-[var(--ink)] focus:outline-none"
          />
        </div>
        <Button disabled={busy} onClick={save} size="lg" className="mt-4 w-full">
          {busy ? "Saving…" : "Finish"}
        </Button>
      </div>
    </div>
  );
}

export default PhoneStepModal;
