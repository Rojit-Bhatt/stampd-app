import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../../components/ui/skeleton";

interface SubscriptionPlanOption {
  slug: string;
  name: string;
}

interface SubscriptionKey {
  id: string;
  code: string;
  planSlug: string;
  status: "unused" | "redeemed" | "revoked";
  note: string;
  assignedToOwnerAccountId: string | null;
  createdAt: string;
  redeemedAt: string | null;
}

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  unused: { bg: "var(--info-soft)", fg: "var(--info)" },
  redeemed: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  revoked: { bg: "var(--line)", fg: "var(--soft)" },
};

export default function SubscriptionKeys() {
  const qc = useQueryClient();
  const [planSlug, setPlanSlug] = useState("");
  const [note, setNote] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const { data: plans = [] } = useQuery<SubscriptionPlanOption[]>({
    queryKey: ["platformPlansForKeys"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; plans: SubscriptionPlanOption[] }>("/api/platform/plans", { role: "platform" });
      return res.plans || [];
    },
  });

  const { data: keys = [], isLoading } = useQuery<SubscriptionKey[]>({
    queryKey: ["subscriptionKeys"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; keys: SubscriptionKey[] }>("/api/platform/subscription-keys", { role: "platform" });
      return res.keys || [];
    },
  });

  const generate = useMutation({
    mutationFn: () => apiRequest<{ success: boolean; key: SubscriptionKey }>("/api/platform/subscription-keys", { method: "POST", role: "platform", body: { planSlug, note } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["subscriptionKeys"] });
      setLastGenerated(res.key.code);
      setNote("");
      toast.success("Key generated!");
    },
    onError: (e: any) => toast.error(e.message || "Couldn't generate a key — try again."),
  });

  const revoke = useMutation({
    mutationFn: (code: string) => apiRequest(`/api/platform/subscription-keys/${code}`, { method: "DELETE", role: "platform" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptionKeys"] });
      toast.success("Key revoked.");
    },
    onError: (e: any) => toast.error(e.message || "Couldn't revoke that — try again."),
  });

  return (
    <div>
      <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Subscription keys</h1>
      <p className="mb-6 text-[var(--muted)]">
        Generate a key after confirming payment with a business over phone/email, then hand it over the same way.
        No payment gateway is wired up — activation is entirely manual.
      </p>

      <div className="mb-6 max-w-lg rounded-[var(--radius-card)] bg-[var(--surface)] p-6 shadow-ambient">
        <h3 className="mb-4 font-display text-lg font-bold text-[var(--ink)]">Generate a key</h3>
        <div className="flex flex-col gap-3">
          <select
            value={planSlug}
            onChange={(e) => setPlanSlug(e.target.value)}
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="">Select a plan…</option>
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (e.g. which business, invoice ref)"
            className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !planSlug}
            className="stamp-interactive rounded-[var(--radius-btn)] py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--primary)" }}
          >
            {generate.isPending ? "Generating…" : "Generate key"}
          </button>

          {lastGenerated && (
            <div className="rounded-[var(--radius-btn)] border border-[var(--ok-soft)] bg-[var(--ok-soft)] px-4 py-3 text-sm" style={{ color: "var(--ok)" }}>
              Give this code to the business: <span className="font-mono font-bold">{lastGenerated}</span>
            </div>
          )}
        </div>
      </div>

      <div className="shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Code</span>
          <span>Plan</span>
          <span>Status</span>
          <span>Note</span>
          <span></span>
        </div>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 last:border-b-0">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-8 w-16 rounded-full" />
            </div>
          ))
        ) : keys.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">No keys generated yet.</div>
        ) : (
          keys.map((k) => (
            <div key={k.id} className="grid grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] items-center gap-3 border-b border-[var(--line)] px-5 py-3.5 text-sm last:border-b-0">
              <span className="font-mono font-bold">{k.code}</span>
              <span className="capitalize">{k.planSlug}</span>
              <span>
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold capitalize"
                  style={{ background: STATUS_COLOR[k.status].bg, color: STATUS_COLOR[k.status].fg }}
                >
                  {k.status}
                </span>
              </span>
              <span className="truncate text-[var(--muted)]">{k.note || "—"}</span>
              <span>
                {k.status === "unused" && (
                  <button onClick={() => revoke.mutate(k.code)} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]">
                    Revoke
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
