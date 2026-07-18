import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { usePlatformAuth } from "../../context/PlatformAuthContext";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  platformRole: "owner" | "support";
  createdAt: string;
}

const EMPTY_FORM = { name: "", email: "", password: "", platformRole: "support" as "owner" | "support" };

export default function PlatformTeam() {
  const { user } = usePlatformAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const { data: admins = [], isLoading } = useQuery<PlatformAdmin[]>({
    queryKey: ["platformAdmins"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; admins: PlatformAdmin[] }>(
        "/api/platform/admins",
        { role: "platform" },
      );
      return res.admins || [];
    },
    enabled: user?.platformRole === "owner",
  });

  const invite = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) =>
      apiRequest("/api/platform/admins", { method: "POST", role: "platform", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformAdmins"] });
      toast.success("Admin invited!");
      setForm(EMPTY_FORM);
    },
    onError: (e) => toast.error((e as Error).message || "Couldn't invite that admin — try again."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/platform/admins/${id}`, { method: "DELETE", role: "platform" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platformAdmins"] });
      toast.success("Admin removed.");
    },
    onError: (e) => toast.error((e as Error).message || "Couldn't remove that admin — try again."),
  });

  if (!user || user.platformRole !== "owner") {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-8 text-center">
        <p className="text-sm font-bold text-[var(--ink)]">Owners only</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Your support role can't manage the platform team.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Team</h1>
      <p className="mb-6 text-[var(--muted)]">Platform staff with access to this console.</p>

      <div className="mb-6 shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="grid grid-cols-[2fr_1fr_1fr_auto] border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Name / email</span>
          <span>Role</span>
          <span>Added</span>
          <span></span>
        </div>
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-8 w-16 rounded-full" />
            </div>
          ))
        ) : (
          admins.map((a) => (
            <div key={a.id} className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 text-sm last:border-b-0">
              <span>
                <span className="block font-bold">{a.name}</span>
                <span className="block text-xs text-[var(--soft)]">{a.email}</span>
              </span>
              <span>
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={
                    a.platformRole === "owner"
                      ? { background: "var(--primary-soft)", color: "var(--primary-deep)" }
                      : { background: "var(--line)", color: "var(--soft)" }
                  }
                >
                  {a.platformRole}
                </span>
              </span>
              <span className="text-[var(--muted)]">
                {new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span>
                {a.id !== user.id && (
                  <button
                    onClick={() => setPendingRemoveId(a.id)}
                    className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]"
                  >
                    Remove
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="shadow-ambient max-w-md rounded-[var(--radius-card)] bg-[var(--surface)] p-6">
        <h3 className="mb-4 font-display text-lg font-bold text-[var(--ink)]">Invite an admin</h3>
        <div className="flex flex-col gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            type="email"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Temporary password"
            type="password"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <select
            value={form.platformRole}
            onChange={(e) => setForm((f) => ({ ...f, platformRole: e.target.value as "owner" | "support" }))}
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="support">Support (read-only)</option>
            <option value="owner">Owner (full access)</option>
          </select>
          <button
            onClick={() => invite.mutate(form)}
            disabled={invite.isPending || !form.name || !form.email || !form.password}
            className="stamp-interactive rounded-[var(--radius-btn)] py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--primary)" }}
          >
            {invite.isPending ? "Inviting…" : "Invite"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingRemoveId !== null}
        onOpenChange={(open) => !open && setPendingRemoveId(null)}
        title="Remove this admin?"
        description="They'll immediately lose access to the platform console."
        confirmLabel="Remove"
        confirmColor="var(--err)"
        onConfirm={() => {
          if (pendingRemoveId) remove.mutate(pendingRemoveId);
          setPendingRemoveId(null);
        }}
      />
    </div>
  );
}
