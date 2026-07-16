import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export interface MenuImportPreviewRow {
  key: string;
  status: "new" | "changed" | "unchanged";
  existingId: string | null;
  name: string;
  price: number | null;
  category: string;
  description: string;
  previous?: { price: number | null; category: string; description: string };
}

export interface MenuImportPreview {
  rows: MenuImportPreviewRow[];
  skipped: number;
  summary: { newCount: number; changedCount: number; unchangedCount: number };
}

interface MenuImportPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: MenuImportPreview | null;
  onApprove: () => void;
  approving: boolean;
}

const formatPrice = (p: number | null) => (typeof p === "number" ? p.toString() : "—");

export function MenuImportPreviewModal({ open, onOpenChange, preview, onApprove, approving }: MenuImportPreviewModalProps) {
  if (!preview) return null;

  const newRows = preview.rows.filter((r) => r.status === "new");
  const changedRows = preview.rows.filter((r) => r.status === "changed");
  const approveCount = newRows.length + changedRows.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] max-h-[85vh] overflow-y-auto shadow-ambient rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xl">
        <DialogHeader className="gap-1.5 text-left">
          <DialogTitle className="font-display text-lg font-extrabold text-[var(--ink)]">
            Review this import
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--muted)]">
            Nothing has been saved yet. Check this summary, then approve or cancel.
            {preview.skipped > 0 && ` ${preview.skipped} row(s) were skipped (missing a name or over the row limit).`}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 flex flex-col gap-4">
          {newRows.length > 0 && (
            <section className="rounded-2xl border border-[#CBE4D6] bg-[var(--ok-soft)] p-4">
              <div className="mb-2 text-sm font-bold" style={{ color: "var(--ok)" }}>
                We found {newRows.length} brand new item{newRows.length === 1 ? "" : "s"} to add
              </div>
              <div className="flex flex-col gap-1.5">
                {newRows.map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-semibold text-[var(--ink)]">{row.name}</span>
                    <span className="flex-shrink-0 text-[var(--muted)]">
                      {formatPrice(row.price)} · {row.category}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {changedRows.length > 0 && (
            <section className="rounded-2xl border border-[#EBDCAE] bg-[var(--warn-soft)] p-4">
              <div className="mb-2 text-sm font-bold" style={{ color: "var(--warn)" }}>
                We found {changedRows.length} item{changedRows.length === 1 ? "" : "s"} with changes
              </div>
              <div className="flex flex-col gap-1.5">
                {changedRows.map((row) => (
                  <div key={row.key} className="text-sm">
                    <span className="font-semibold text-[var(--ink)]">{row.name}</span>
                    {row.previous && row.previous.price !== row.price && (
                      <span className="text-[var(--muted)]">
                        {" "}
                        — price {formatPrice(row.previous.price)} to {formatPrice(row.price)}
                      </span>
                    )}
                    {row.previous && row.previous.category !== row.category && (
                      <span className="text-[var(--muted)]">
                        {" "}
                        — category {row.previous.category} to {row.category}
                      </span>
                    )}
                    {row.previous &&
                      row.previous.description !== row.description &&
                      row.previous.price === row.price &&
                      row.previous.category === row.category && (
                        <span className="text-[var(--muted)]"> — description updated</span>
                      )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {preview.summary.unchangedCount > 0 && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4 text-sm text-[var(--muted)]">
              We found {preview.summary.unchangedCount} item{preview.summary.unchangedCount === 1 ? "" : "s"} that
              {preview.summary.unchangedCount === 1 ? " is" : " are"} exactly the same — no changes needed.
            </div>
          )}

          {approveCount === 0 && preview.summary.unchangedCount === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">
              Nothing usable was found in this file.
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-[12px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 text-sm font-bold text-[var(--ink)] hover:bg-[var(--line)]"
          >
            Cancel
          </button>
          <button
            onClick={onApprove}
            disabled={approveCount === 0 || approving}
            className="rounded-[12px] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {approving ? "Saving…" : `Approve and save (${approveCount})`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
