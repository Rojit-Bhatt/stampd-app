import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "../ui/alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor = "var(--err)",
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[420px] rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xl">
        <AlertDialogHeader className="gap-1.5">
          <AlertDialogTitle className="font-display text-lg font-extrabold text-[var(--ink)]">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-[var(--muted)]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex flex-row justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 text-sm font-bold text-[var(--ink)] hover:bg-[var(--line)]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="rounded-[12px] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: confirmColor }}
          >
            {confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
