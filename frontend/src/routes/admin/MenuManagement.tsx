import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Download } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest, getTenantSlug } from "../../lib/api";
import { useAdminSettings, useUpdateAdminSettings } from "../../hooks/useAdminSettings";

interface MenuItem {
  id?: string;
  _id?: string;
  name: string;
  description: string;
  price: string;
  category: string;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

const itemId = (i: MenuItem) => i.id || (i._id as string);

function useMenu() {
  return useQuery<MenuItem[]>({
    queryKey: ["adminMenu"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; items: MenuItem[] }>("/api/admin/menu", {
        role: "admin",
      });
      return res.items || [];
    },
  });
}

export default function MenuManagement() {
  const qc = useQueryClient();
  const { data: settings } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const { data: items = [], isLoading } = useMenu();

  const [draft, setDraft] = useState({ name: "", description: "", price: "", category: "General" });
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const menuEnabled = settings?.menuEnabled ?? false;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminMenu"] });

  const downloadTemplate = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const slug = getTenantSlug();
    const res = await fetch("/api/admin/menu/template", {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(slug ? { "X-Tenant-Slug": slug } : {}),
      },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "menu-template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiRequest<{ success: boolean; imported: number; skipped: number }>(
        "/api/admin/menu/import",
        { method: "POST", role: "admin", body: form },
      );
      const suffix = res.skipped ? `, skipped ${res.skipped} row(s)` : "";
      toast.success(`Imported ${res.imported} item(s)${suffix}`);
      invalidate();
    } catch (err) {
      toast.error((err as Error).message || "Import failed.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const createItem = useMutation({
    mutationFn: (body: typeof draft) =>
      apiRequest("/api/admin/menu", { method: "POST", role: "admin", body }),
    onSuccess: () => {
      invalidate();
      setDraft({ name: "", description: "", price: "", category: "General" });
      toast.success("Item added");
    },
    onError: (e) => toast.error((e as Error).message || "Failed to add."),
  });

  const patchItem = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<MenuItem> }) =>
      apiRequest(`/api/admin/menu/${id}`, { method: "PATCH", role: "admin", body }),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/menu/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: () => {
      invalidate();
      toast.success("Item removed");
    },
  });

  const categories = Array.from(new Set(items.map((i) => i.category || "General")));

  return (
    <div className="max-w-[720px]">
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Menu</h1>
      <p className="mb-5 text-[var(--muted)]">A display-only menu customers can browse in the app.</p>

      {/* Toggle */}
      <div className="mb-5 flex items-center justify-between rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div>
          <div className="text-[15px] font-bold">Show menu to customers</div>
          <div className="text-[13px] text-[var(--muted)]">
            {menuEnabled ? "Customers can see your menu in the app" : "Hidden — no menu tab shown"}
          </div>
        </div>
        <button
          onClick={() => updateSettings.mutate({ menuEnabled: !menuEnabled })}
          className="relative h-8 w-14 rounded-full transition-colors"
          style={{ background: menuEnabled ? "var(--brand)" : "#DDD2CB" }}
          aria-pressed={menuEnabled}
          aria-label="Toggle menu visibility"
        >
          <span
            className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all"
            style={{ left: menuEnabled ? 28 : 4 }}
          />
        </button>
      </div>

      {/* Import from Excel */}
      <div className="mb-6 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-3 text-sm font-bold">Import from Excel</div>
        <p className="mb-3 text-[13px] text-[var(--muted)]">
          Columns: Name (required), Price, Category, Description.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-bold"
          >
            <Download className="h-4 w-4" /> Download template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
            className="text-sm"
          />
          {importing && <span className="text-sm text-[var(--muted)]">Importing…</span>}
        </div>
      </div>

      {/* Add item */}
      <div className="mb-6 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-3 text-sm font-bold">Add an item</div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
          <input
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            placeholder="Price (e.g. ₹120)"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
          <input
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            placeholder="Category"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
        </div>
        <button
          onClick={() => draft.name.trim() && createItem.mutate(draft)}
          disabled={createItem.isPending || !draft.name.trim()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[11px] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          <Plus className="h-4 w-4" /> Add item
        </button>
      </div>

      {/* List grouped by category */}
      <div className="flex flex-col gap-6" style={{ opacity: menuEnabled ? 1 : 0.55 }}>
        {isLoading ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">
            No menu items yet. Add your first above.
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat}>
              <h3 className="mb-2.5 font-display text-base font-bold" style={{ color: "var(--brand)" }}>
                {cat}
              </h3>
              <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)]">
                {items
                  .filter((i) => (i.category || "General") === cat)
                  .map((i) => (
                    <div
                      key={itemId(i)}
                      className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-semibold">{i.name}</div>
                        <div className="truncate text-[13px] text-[var(--muted)]">{i.description}</div>
                      </div>
                      <span className="text-sm font-bold">{i.price}</span>
                      <button
                        onClick={() =>
                          patchItem.mutate({ id: itemId(i), body: { isAvailable: !i.isAvailable } })
                        }
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: i.isAvailable ? "var(--ok-soft)" : "var(--warn-soft)",
                          color: i.isAvailable ? "var(--ok)" : "var(--warn)",
                        }}
                      >
                        {i.isAvailable ? "Available" : "Sold out"}
                      </button>
                      <button
                        onClick={() =>
                          patchItem.mutate({ id: itemId(i), body: { isFeatured: !i.isFeatured } })
                        }
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: i.isFeatured ? "var(--brand)" : "var(--bg)",
                          color: i.isFeatured ? "#fff" : "var(--muted)",
                        }}
                      >
                        {i.isFeatured ? "Featured" : "Feature"}
                      </button>
                      <button
                        onClick={() => deleteItem.mutate(itemId(i))}
                        className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--err)]"
                        aria-label={`Delete ${i.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
