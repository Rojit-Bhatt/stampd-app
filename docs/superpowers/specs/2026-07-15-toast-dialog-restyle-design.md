# Epic E4: Toast Restyle + Confirm Dialogs — Design

## Context

Final item of Epic E, executed autonomously per explicit user authorization (locked decisions from `AskUserQuestion`, no further approval gates).

Locked decisions:
- **Toasts:** `react-hot-toast` currently renders with its library default look (white background, default sans font, default green/red icon colors) — brand it to match Stampd (cream/ink palette).
- **Dialogs:** grep-confirmed zero existing `Dialog`/`AlertDialog` usage anywhere in the frontend. Destructive actions (delete an event, suspend/reactivate a business) currently fire immediately on click with no confirmation. Add confirm dialogs for these, using the existing (currently unused, un-themed) shadcn `AlertDialog` primitive, restyled to match Stampd — this is new functionality, not a pure restyle, but it's the only way this half of E4 does anything real.

## Toast restyle

`App.tsx`'s `<Toaster position="bottom-center" />` gains a `toastOptions` prop:
- `style`: `background: var(--surface)`, `color: var(--ink)`, `border: 1px solid var(--line)`, `borderRadius: 13px`, `fontFamily` inherited (body font is already Plus Jakarta Sans globally, no override needed), `padding`, `boxShadow` matching the app's existing card shadow language.
- `success.iconTheme`: `primary: var(--ok)`, `secondary: white`.
- `error.iconTheme`: `primary: var(--err)`, `secondary: white`.

One place, affects every `toast.success(...)`/`toast.error(...)`/`toast.loading(...)` call app-wide — no per-call-site changes needed.

## Confirm dialogs

New `frontend/src/components/shared/ConfirmDialog.tsx` — a controlled wrapper around the existing `components/ui/alert-dialog.tsx` primitives (`AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`), restyled with Stampd tokens (`--surface`/`--ink`/`--muted`/`--line`, rounded-[20px] card, `font-display` title). Footer uses plain styled `<button>`s (not the shadcn `AlertDialogAction`/`AlertDialogCancel`, which carry generic `buttonVariants()` classes that would visually conflict with Stampd's inline-style color pattern used everywhere else in this codebase) — Radix's controlled `open`/`onOpenChange` on the `AlertDialog` root already provides Escape/overlay-click-to-close regardless of which children trigger it.

Props: `{ open, onOpenChange, title, description, confirmLabel?, cancelLabel?, confirmColor?, onConfirm }`. `confirmColor` is a raw CSS-var string (e.g. `"var(--err)"`), matching the existing per-screen inline-`style`-based color-coding already used throughout (e.g. `BusinessDetail.tsx`'s suspend/reactivate button).

Three call sites, each gaining local `const [confirmOpen, setConfirmOpen] = useState(false)` (plus, for the two list screens, `const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)` since which row is being deleted must be tracked):
- `AdminEvents.tsx` — the Trash2 button opens the dialog instead of calling `deleteEvent.mutate(id)` directly; the dialog's `onConfirm` calls it. Title: "Delete this event?" Description: the event's title, e.g. `` `"${title}" will be removed and no longer shown to customers.` ``. `confirmColor="var(--err)"`.
- `MenuManagement.tsx` — same pattern for its Trash2 button and `deleteItem.mutate(id)` (grep-confirmed this delete exists too, same unprotected-destructive-action shape as the event delete — leaving it out while fixing the other two would be an arbitrary inconsistency, not a deliberate scope line). Title: "Delete this item?" Description: the item's name, e.g. `` `"${name}" will be removed from your menu.` ``. `confirmColor="var(--err)"`.
- `BusinessDetail.tsx` — the Suspend/Reactivate button opens the dialog instead of calling `setStatus.mutate(...)` directly. Title/description/color differ by direction: suspending asks "Suspend this business?" / "Customers and the admin login will be disabled until reactivated." with `confirmColor="var(--warn)"`; reactivating asks "Reactivate this business?" / "Customers and the admin login will work again immediately." with `confirmColor="var(--ok)"`.

## Out of scope

- Any destructive action beyond these three — grep-confirmed no other `DELETE`/suspend-style button exists anywhere else in the frontend.
- Toast content/copy changes — purely visual restyle, no wording changes to any existing `toast.success(...)`/`toast.error(...)` call.
