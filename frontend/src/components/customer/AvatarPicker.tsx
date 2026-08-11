import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import toast from "@/lib/toast";

import { useCustomerAuth, type GlobalAccount } from "../../context/CustomerAuthContext";
import { apiRequest } from "../../lib/api";
import { CustomerAvatar } from "./CustomerAvatar";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Profile-picture section of the customer's Profile page.
 *
 * The picture belongs to the global CustomerAccount, not to any one outlet's
 * membership — a customer has one face across every cafe — so this talks to
 * /api/customer-auth with the global session rather than to /api/account,
 * which is tenant-scoped.
 *
 * Tapping the avatar itself opens an action sheet (Choose photo / Remove),
 * rather than a separate "Change" button, so the tap target IS the thing
 * being changed. Picking a photo hands off to AvatarCropDialog for manual
 * positioning before upload — this component only owns the action sheet,
 * the upload call, and the optimistic preview.
 */
export function AvatarPicker({ className = "" }: { className?: string }) {
  const { globalAccount, setGlobalAccountData } = useCustomerAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // A local object URL of the cropped blob, shown the instant it exists. The
  // upload round-trip plus a fresh image fetch is otherwise a visible pause
  // on a phone connection, during which the old picture is still on screen.
  const [preview, setPreview] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const hasAvatar = Boolean(globalAccount?.avatarVersion);

  // Mirrors `preview` so the unmount cleanup can reach the CURRENT url — an
  // effect with an empty dep array closes over the initial null and would
  // revoke nothing. Without this, uploading and then navigating away pins the
  // blob for the lifetime of the page.
  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const setPreviewUrl = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  };

  const uploadBlob = async (blob: Blob) => {
    setBusy(true);
    try {
      setPreviewUrl(URL.createObjectURL(blob));
      const form = new FormData();
      form.append("file", blob, "avatar.webp");
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/avatar",
        { method: "POST", role: "customer-global", body: form },
      );
      setGlobalAccountData(res.account);
      toast.success("Profile picture updated!");
    } catch (err) {
      // Drop the optimistic preview — leaving it up would show a picture that
      // isn't actually saved anywhere.
      setPreviewUrl(null);
      toast.error((err as Error).message || "Couldn't save that picture — try another.");
    } finally {
      setBusy(false);
      // Lets the same file be picked again after a failure; without this the
      // input's value is unchanged and onChange never fires a second time.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setActionSheetOpen(false);
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/avatar",
        { method: "DELETE", role: "customer-global" },
      );
      setPreviewUrl(null);
      setGlobalAccountData(res.account);
      toast.success("Profile picture removed.");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't remove that — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-ambient ${className}`}
    >
      <div className="mb-3 text-sm font-bold">Profile picture</div>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => setActionSheetOpen(true)}
          disabled={busy}
          className="relative flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
        >
          {preview ? (
            <img src={preview} alt="" className="h-16 w-16 rounded-full bg-[var(--surface-2)] object-cover" />
          ) : (
            <CustomerAvatar
              accountId={globalAccount?.id}
              avatarVersion={globalAccount?.avatarVersion}
              name={globalAccount?.name}
              size={64}
            />
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[var(--primary)]">
            <Camera className="h-3 w-3 text-white" />
          </span>
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
              <Loader2 className="h-5 w-5 animate-spin text-white motion-reduce:animate-none" />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--muted)]">Tap your picture to change it.</p>
        </div>
      </div>

      <Sheet open={actionSheetOpen} onOpenChange={setActionSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-[var(--radius-card)]">
          <SheetHeader>
            <SheetTitle className="font-display text-lg font-bold text-[var(--ink)]">Profile picture</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                setActionSheetOpen(false);
                inputRef.current?.click();
              }}
            >
              <Camera className="h-4 w-4" />
              Choose photo
            </Button>
            {hasAvatar && (
              <Button type="button" variant="outline" onClick={onRemove}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AvatarCropDialog
        file={pendingFile}
        onCancel={() => {
          setPendingFile(null);
          if (inputRef.current) inputRef.current.value = "";
        }}
        onSave={(blob) => {
          setPendingFile(null);
          uploadBlob(blob);
        }}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
