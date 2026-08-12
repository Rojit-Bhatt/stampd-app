import { useEffect, useState } from "react";
import toast from "@/lib/toast";

import {
  useStaff,
  useInviteStaff,
  useUpdateStaffRole,
  useRemoveStaff,
  useSetStaffPin,
} from "../../hooks/useStaff";
import type { StaffMember } from "../../hooks/useStaff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ScrollableTable, STICKY_FIRST_CELL } from "../shared/ScrollableTable";

// --- Invite dialog ------------------------------------------------------

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const invite = useInviteStaff();
  const [form, setForm] = useState({ name: "", email: "", staffRole: "staff" as "manager" | "staff", password: "", pin: "" });

  useEffect(() => {
    if (open) setForm({ name: "", email: "", staffRole: "staff", password: "", pin: "" });
  }, [open]);

  const pinValid = /^\d{4}$/.test(form.pin);
  const valid = form.name.trim() && form.email.trim() && form.password && pinValid;

  const submit = async () => {
    try {
      await invite.mutateAsync(form);
      toast.success("Invited — they'll verify their email before signing in.");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't invite them — try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-[var(--ink)]">Invite staff</DialogTitle>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3">
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <div>
            <SegmentedControl
              value={form.staffRole}
              onValueChange={(v) => setForm((f) => ({ ...f, staffRole: v as "manager" | "staff" }))}
              aria-label="Role"
            >
              <SegmentedControlItem value="staff">Staff</SegmentedControlItem>
              <SegmentedControlItem value="manager">Manager</SegmentedControlItem>
            </SegmentedControl>
            <p className="mt-1.5 text-xs text-[var(--soft)]">
              {form.staffRole === "manager"
                ? "Everything except managing other staff."
                : "The counter only — earn and redeem codes."}
            </p>
          </div>
          <Input
            placeholder="Temporary password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          <Input
            placeholder="4-digit PIN"
            inputMode="numeric"
            maxLength={4}
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-bold text-[var(--muted)]"
          >
            Cancel
          </button>
          <Button onClick={submit} disabled={!valid || invite.isPending}>
            {invite.isPending ? "Inviting…" : "Send invite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Set/reset PIN dialog ------------------------------------------------

interface PinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetId: string;
  targetName: string;
  /** Self, already has a PIN -> must supply the matching currentPin. */
  requireCurrentPin: boolean;
}

function PinDialog({ open, onOpenChange, targetId, targetName, requireCurrentPin }: PinDialogProps) {
  const setPin = useSetStaffPin();
  const [pin, setPinValue] = useState("");
  const [currentPin, setCurrentPin] = useState("");

  useEffect(() => {
    if (open) {
      setPinValue("");
      setCurrentPin("");
    }
  }, [open]);

  const valid = /^\d{4}$/.test(pin) && (!requireCurrentPin || /^\d{4}$/.test(currentPin));

  const submit = async () => {
    try {
      await setPin.mutateAsync({ id: targetId, pin, currentPin: requireCurrentPin ? currentPin : undefined });
      toast.success("PIN set!");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't set that PIN — try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-[var(--ink)]">
            {targetName}&rsquo;s PIN
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-3">
          {requireCurrentPin && (
            <Input
              placeholder="Current PIN"
              inputMode="numeric"
              type="password"
              maxLength={4}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          )}
          <Input
            placeholder="New 4-digit PIN"
            inputMode="numeric"
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-bold text-[var(--muted)]"
          >
            Cancel
          </button>
          <Button onClick={submit} disabled={!valid || setPin.isPending}>
            {setPin.isPending ? "Saving…" : "Save PIN"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- The tab --------------------------------------------------------------

function RoleBadge({ member }: { member: StaffMember }) {
  if (member.isPrimary) return <Badge variant="neutral">Primary admin</Badge>;
  return <Badge variant={member.staffRole === "manager" ? "active" : "outline"}>{member.staffRole}</Badge>;
}

function StaffRow({ member }: { member: StaffMember }) {
  const updateRole = useUpdateStaffRole();
  const remove = useRemoveStaff();
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const changeRole = async (staffRole: "manager" | "staff") => {
    try {
      await updateRole.mutateAsync({ id: member.id, staffRole });
      toast.success("Role updated!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't change that role — try again.");
    }
  };

  const doRemove = async () => {
    try {
      await remove.mutateAsync(member.id);
      toast.success(`${member.name} removed.`);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't remove them — try again.");
    }
  };

  return (
    <div className="grid items-center gap-4 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0"
      style={{ gridTemplateColumns: "2fr 1.2fr 0.8fr 1.4fr" }}
    >
      <span className={`min-w-0 ${STICKY_FIRST_CELL}`}>
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--ink)]">{member.name}</span>
          {member.isSelf && <Badge variant="neutral">You</Badge>}
          {!member.emailVerified && <Badge variant="pending">Unverified</Badge>}
        </span>
        <span className="block truncate text-xs text-[var(--soft)]">{member.email}</span>
      </span>

      {member.isPrimary || member.isSelf ? (
        <RoleBadge member={member} />
      ) : (
        <SegmentedControl
          value={member.staffRole ?? "staff"}
          onValueChange={(v) => changeRole(v as "manager" | "staff")}
          aria-label={`${member.name}'s role`}
        >
          <SegmentedControlItem value="staff">Staff</SegmentedControlItem>
          <SegmentedControlItem value="manager">Manager</SegmentedControlItem>
        </SegmentedControl>
      )}

      <span>
        <Badge variant={member.hasPin ? "active" : "neutral"}>{member.hasPin ? "PIN set" : "No PIN"}</Badge>
      </span>

      <span className="flex justify-end gap-2">
        <button
          onClick={() => setPinDialogOpen(true)}
          className="rounded-full border border-[var(--line)] px-3.5 py-1.5 text-xs font-bold text-[var(--ink)] hover:border-[var(--primary)] hover:text-[var(--primary-deep)]"
        >
          {member.hasPin ? "Reset PIN" : "Set PIN"}
        </button>
        {!member.isPrimary && (
          <button
            onClick={() => setRemoveOpen(true)}
            className="rounded-full border border-[var(--line)] px-3.5 py-1.5 text-xs font-bold text-[var(--err)] hover:bg-[var(--err-soft)]"
          >
            Remove
          </button>
        )}
      </span>

      <PinDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        targetId={member.isSelf ? "me" : member.id}
        targetName={member.name}
        requireCurrentPin={member.isSelf && member.hasPin}
      />
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${member.name}?`}
        description="They lose access to this outlet immediately. Their past activity on the ledger keeps their name."
        confirmLabel="Remove"
        onConfirm={doRemove}
      />
    </div>
  );
}

export function SubAdminSettingsTab() {
  const { data, isLoading } = useStaff();
  const [inviteOpen, setInviteOpen] = useState(false);

  const staff = data?.staff ?? [];
  const me = staff.find((s) => s.isSelf);
  const needsOwnPinFirst = Boolean(me && !me.hasPin);

  return (
    <ScrollableTable minContentWidth="620px">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-5">
        <p className="max-w-md text-sm text-[var(--muted)]">
          Once anyone here has a PIN, everyone needs one to use the earn and redeem screens.
        </p>
        <Button
          onClick={() => setInviteOpen(true)}
          disabled={needsOwnPinFirst}
          title={needsOwnPinFirst ? "Set your own PIN first — see your row below." : undefined}
        >
          Invite staff
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      ) : (
        staff.map((member) => <StaffRow key={member.id} member={member} />)
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </ScrollableTable>
  );
}
