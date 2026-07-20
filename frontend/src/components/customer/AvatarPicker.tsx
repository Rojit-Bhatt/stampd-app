import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useCustomerAuth, type GlobalAccount } from "../../context/CustomerAuthContext";
import { apiRequest } from "../../lib/api";
import { resizeToAvatar } from "../../lib/avatar";
import { CustomerAvatar } from "./CustomerAvatar";
import { Button } from "@/components/ui/button";

/**
 * Profile-picture section of the customer's Profile page.
 *
 * The picture belongs to the global CustomerAccount, not to any one outlet's
 * membership — a customer has one face across every cafe — so this talks to
 * /api/customer-auth with the global session rather than to /api/account,
 * which is tenant-scoped.
 */
export function AvatarPicker({ className = "" }: { className?: string }) {
  const { globalAccount, setGlobalAccountData } = useCustomerAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // A local object URL of the resized blob, shown the instant it exists. The
  // upload round-trip plus a fresh image fetch is otherwise a visible pause
  // on a phone connection, during which the old picture is still on screen.
  const [preview, setPreview] = useState<string | null>(null);

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

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      // Resized before upload, not after: see lib/avatar.ts for why this is
      // the whole storage story.
      const blob = await resizeToAvatar(file);
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

      {/* Stacks below sm. Side by side, the buttons are squeezed into a
          ~200px column on a 375px phone and wrap one under the other at
          different widths; stacking gives them the full row instead. */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-shrink-0">
          {preview ? (
            <img
              src={preview}
              alt=""
              className="h-16 w-16 rounded-full bg-[var(--surface-2)] object-cover"
            />
          ) : (
            <CustomerAvatar
              accountId={globalAccount?.id}
              avatarVersion={globalAccount?.avatarVersion}
              name={globalAccount?.name}
              size={64}
            />
          )}
          {busy && (
            // A fixed dark scrim with a light spinner, NOT bg-[var(--ink)]:
            // --ink inverts in dark mode to a near-white, which would put a
            // white spinner on a white scrim and make the only feedback
            // during a multi-second upload vanish. motion-reduce guard
            // because Tailwind's animate-spin has none of its own.
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
              <Loader2 className="h-5 w-5 animate-spin text-white motion-reduce:animate-none" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* The shared Button, not hand-rolled classes: it carries the 44px
              touch target, the focus ring and the press feedback that the
              rest of the customer app has. This is a phone-first page. */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Camera className="h-4 w-4" />
              {hasAvatar ? "Change" : "Add a picture"}
            </Button>
            {hasAvatar && (
              <Button type="button" variant="outline" onClick={onRemove} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-[13px] text-[var(--muted)]">
            Cropped to a square and shrunk on your phone before it uploads, so it barely uses
            any data.
          </p>
        </div>
      </div>

      {/* `capture` is deliberately omitted: on a phone that lets the customer
          choose between the camera and an existing photo, rather than forcing
          the camera open. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </div>
  );
}
