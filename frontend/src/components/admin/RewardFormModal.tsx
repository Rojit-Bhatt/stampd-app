import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "@/lib/toast";
import { apiRequest } from "../../lib/api";
import { resolveImageUrl } from "../../lib/images";
import { CreatePreviewModal } from "../shared/CreatePreviewModal";
import { FileDrop } from "../shared/FileDrop";
import { RewardCard } from "../customer/RewardCard";

export interface AdminRewardItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  pointsPrice: number;
  isActive: boolean;
  sortOrder: number;
}

interface Draft {
  name: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  pointsPrice: number;
}

const emptyDraft = (): Draft => ({ name: "", description: "", imageUrl: "", imageId: null, pointsPrice: 100 });

const draftFrom = (r: AdminRewardItem): Draft => ({
  name: r.name, description: r.description, imageUrl: r.imageUrl, imageId: r.imageId, pointsPrice: r.pointsPrice,
});

interface RewardFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdminRewardItem | null;
  onSaved: () => void;
}

export function RewardFormModal({ open, onOpenChange, initial, onSaved }: RewardFormModalProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  useEffect(() => {
    if (open) setDraft(initial ? draftFrom(initial) : emptyDraft());
  }, [open, initial]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminRewards"] });

  const create = useMutation({
    mutationFn: (d: Draft) => apiRequest("/api/admin/rewards", { method: "POST", role: "admin", body: d }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Draft }) =>
      apiRequest(`/api/admin/rewards/${id}`, { method: "PATCH", role: "admin", body: patch }),
    onSuccess: invalidate,
  });

  const busy = create.isPending || update.isPending;

  const save = async () => {
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, patch: draft });
        toast.success("Reward updated!");
      } else {
        await create.mutateAsync(draft);
        toast.success("Reward added!");
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  // Number.MAX_SAFE_INTEGER because this preview shows the admin what the
  // reward looks like, not one customer's affordability — the "N more points
  // needed" state depends on who's looking and has no meaning here.
  const previewItem = {
    id: "preview",
    name: draft.name || "Reward name",
    description: draft.description || "Reward description will appear here…",
    imageUrl: resolveImageUrl(draft.imageId, draft.imageUrl),
    pointsPrice: draft.pointsPrice,
  };

  return (
    <CreatePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit reward" : "New reward"}
      saveLabel={initial ? "Save changes" : "Save reward"}
      busy={busy}
      onCancel={() => onOpenChange(false)}
      onSave={save}
      preview={<RewardCard item={previewItem} balance={Number.MAX_SAFE_INTEGER} />}
      form={
        <>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name (e.g. Tote Bag)"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <label className="flex items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5">
            <input
              type="number"
              min={0}
              value={draft.pointsPrice}
              onChange={(e) => setDraft({ ...draft, pointsPrice: Number(e.target.value) })}
              className="w-20 bg-transparent text-sm focus:outline-none"
            />
            <span className="text-sm text-[var(--muted)]">points</span>
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
        </>
      }
    />
  );
}
