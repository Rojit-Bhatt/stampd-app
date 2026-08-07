import toast from "@/lib/toast";
import { useAdminSettings, useUpdateAdminSettings } from "../../hooks/useAdminSettings";
import { SettingRow } from "../shared/SettingRow";
import { Switch } from "../ui/switch";
import { Skeleton } from "../ui/skeleton";

export function CustomerInfoSettingsTab() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();

  if (isLoading || !settings) {
    return (
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-5 w-64" />
      </div>
    );
  }

  const toggle = async (field: "requireDateOfBirth" | "requireGender", value: boolean) => {
    try {
      await update.mutateAsync({ customerInfo: { [field]: value } });
      toast.success("Saved!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
      <p className="mb-2 text-sm text-[var(--muted)]">
        Choose what customers must provide to create an account at this outlet. A field left off stays optional —
        customers can always add it later from their profile.
      </p>
      <SettingRow label="Collect date of birth" description="Required to register here.">
        <Switch
          checked={settings.customerInfo.requireDateOfBirth}
          onCheckedChange={(v) => toggle("requireDateOfBirth", v)}
          aria-label="Require date of birth to register"
        />
      </SettingRow>
      <SettingRow label="Collect gender" description="Required to register here.">
        <Switch
          checked={settings.customerInfo.requireGender}
          onCheckedChange={(v) => toggle("requireGender", v)}
          aria-label="Require gender to register"
        />
      </SettingRow>
    </div>
  );
}
