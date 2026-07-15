import { UtensilsCrossed } from "lucide-react";
import { useCustomerMenu } from "../hooks/useCustomerMenu";
import { useTenant } from "../context/TenantContext";
import { Skeleton } from "../components/ui/skeleton";

// Rendered inside CustomerLayout (phone shell + bottom nav). Content only.
export default function CustomerMenu() {
  const { tenant } = useTenant();
  const { data, isLoading } = useCustomerMenu();

  const menuEnabled = data?.menuEnabled ?? false;
  const items = data?.items ?? [];
  const categories = Array.from(new Set(items.map((i) => i.category || "General")));

  return (
    <div className="px-5 py-6">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Menu</h1>
      <p className="mb-5 text-[13px] text-[var(--muted)]">{tenant?.name}</p>

      {isLoading ? (
        <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <Skeleton className="mb-1.5 h-3.5 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-3.5 w-10" />
            </div>
          ))}
        </div>
      ) : !menuEnabled ? (
        <EmptyState message="This business hasn't added a menu yet." />
      ) : items.length === 0 ? (
        <EmptyState message="Menu coming soon." />
      ) : (
        <div className="flex flex-col gap-6">
          {categories.map((cat) => (
            <div key={cat}>
              <h3 className="mb-2.5 font-display text-base font-bold" style={{ color: "var(--brand)" }}>
                {cat}
              </h3>
              <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)]">
                {items
                  .filter((i) => (i.category || "General") === cat)
                  .map((i) => (
                    <div
                      key={i.id}
                      className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--ink)]">{i.name}</div>
                        {i.description && (
                          <div className="truncate text-[13px] text-[var(--muted)]">{i.description}</div>
                        )}
                      </div>
                      {i.price && <span className="text-sm font-bold text-[var(--ink)]">{i.price}</span>}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-[var(--line)] bg-[var(--bg)]">
        <UtensilsCrossed className="h-7 w-7 text-[var(--soft)]" />
      </div>
      <p className="mx-auto max-w-[240px] text-sm font-bold text-[var(--ink)]">{message}</p>
    </div>
  );
}
