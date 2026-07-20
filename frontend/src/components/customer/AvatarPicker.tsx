import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useCustomerAuth, type GlobalAccount } from "../../context/CustomerAuthContext";
import { apiRequest } from "../../lib/api";
import { resizeToAvatar } from "../../lib/avatar";
import { CustomerAvatar } from "./CustomerAvatar";

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

  const revokePreview = () => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    let localUrl: string | null = null;
    try {
      // Resized before upload, not after: see lib/avatar.ts for why this is
      // the whole storage story.
      const blob = await resizeToAvatar(file);
      localUrl = URL.createObjectURL(blob);
      revokePreview();
      setPreview(localUrl);

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
      if (localUrl) URL.revokeObjectURL(localUrl);
      setPreview(null);
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
      revokePreview();
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

      <div className="flex items-center gap-4">
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
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-[var(--ink)]/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-2 rounded-[var(--radius-btn)] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              <Camera className="h-4 w-4" />
              {hasAvatar ? "Change" : "Add a picture"}
            </button>
            {hasAvatar && (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className="flex items-center gap-2 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 text-sm font-bold text-[var(--muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
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
