import { useEffect, useState } from "react";

import { resolveImageUrl } from "../../lib/images";
import { CreatePreviewModal } from "../shared/CreatePreviewModal";
import { FileDrop } from "../shared/FileDrop";
import { RewardCard } from "../customer/RewardCard";

// The reward config for a MENU item. Same flow as RewardFormModal (photo,
// description, points, live preview) — but the name is the menu item's own and
// can't change here, and points pre-fill from the rupee price so the admin
// usually just confirms. Leaving points blank makes the item menu-only again.
export interface MenuRewardTarget {
  id: string;
  name: string;
  description: string;
  price: number | null;
  pointsPrice: number | null;
  imageUrl?: string;
  imageId?: string | null;
}

export interface MenuRewardPatch {
  pointsPrice: number | null;
  description: string;
  imageId: string | null;
  imageUrl: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MenuRewardTarget | null;
  onSave: (patch: MenuRewardPatch) => void | Promise<void>;
  busy?: boolean;
}

interface Draft {
  pointsPrice: string; // string so the field can be emptied
  description: string;
  imageUrl: string;
  imageId: string | null;
}

export function MenuRewardModal({ open, onOpenChange, item, onSave, busy }: Props) {
  const [draft, setDraft] = useState<Draft>({ pointsPrice: "", description: "", imageUrl: "", imageId: null });

  useEffect(() => {
    if (open && item) {
      setDraft({
        // Prefill = price number if not already a reward; keep the existing
        // points price when re-editing.
        pointsPrice: String(item.pointsPrice ?? item.price ?? ""),
        description: item.description || "",
        imageUrl: item.imageUrl || "",
        imageId: item.imageId ?? null,
      });
    }
  }, [open, item]);

  if (!item) return null;

  const parsedPoints = draft.pointsPrice.trim() === "" ? null : Number(draft.pointsPrice);

  const save = () =>
    onSave({
      pointsPrice: parsedPoints,
      description: draft.description,
      imageId: draft.imageId,
      imageUrl: draft.imageUrl,
    });

  const previewItem = {
    id: "preview",
    name: item.name,
    description: draft.description || "Redeemable menu item",
    imageUrl: resolveImageUrl(draft.imageId, draft.imageUrl),
    pointsPrice: parsedPoints ?? 0,
  };

  return (
    <CreatePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      title="Redeem for points"
      saveLabel="Save reward"
      busy={busy}
      onCancel={() => onOpenChange(false)}
      onSave={save}
      preview={<RewardCard item={previewItem} balance={Number.MAX_SAFE_INTEGER} />}
      form={
        <>
          {/* Name is the menu item's — locked. */}
          <div className="rounded-[11px] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--muted)]">
            {item.name}
          </div>
          <label className="flex items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5">
            <input
              type="number"
              min={0}
              value={draft.pointsPrice}
              onChange={(e) => setDraft({ ...draft, pointsPrice: e.target.value })}
              placeholder="Menu-only"
              className="w-24 bg-transparent text-sm focus:outline-none"
            />
            <span className="text-sm text-[var(--muted)]">points to redeem</span>
          </label>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description (shown to customers)"
            rows={3}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <FileDrop
            mode="image"
            ownerType="reward"
            previewUrl={resolveImageUrl(draft.imageId, draft.imageUrl)}
            onImageUploaded={({ id }) => setDraft((d) => ({ ...d, imageId: id }))}
            onRemove={() => setDraft((d) => ({ ...d, imageId: null, imageUrl: "" }))}
            label="Click to choose a photo, or drag one here"
          />
          <p className="text-[12px] text-[var(--soft)]">
            Leave points blank to keep this item menu-only.
          </p>
        </>
      }
    />
  );
}
