import type { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

interface CreatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: ReactNode;
  preview: ReactNode;
  saveLabel?: string;
  busy?: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Layout only: fields on the left, a live preview on the right.
 *
 * On a phone the preview stacks ABOVE the form (`order` flips it), so it
 * stays on screen while the admin types rather than sitting below the fold —
 * a preview you have to scroll to is a preview nobody looks at.
 */
export function CreatePreviewModal({
  open, onOpenChange, title, form, preview,
  saveLabel = "Save", busy, onSave, onCancel,
}: CreatePreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[880px] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-[var(--ink)]">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="order-2 flex flex-col gap-3 md:order-1">{form}</div>
          <div className="order-1 md:order-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
              Preview
            </div>
            <div className="mt-2 rounded-[var(--radius-card)] bg-[var(--surface-2)] p-4">
              {preview}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-bold text-[var(--muted)]"
          >
            Cancel
          </button>
          <Button onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
