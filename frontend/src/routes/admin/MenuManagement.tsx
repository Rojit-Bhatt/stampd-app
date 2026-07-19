import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Download, UploadCloud, Search } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest, apiUrl, tenantHeaders } from "../../lib/api";
import { useAdminSettings, useUpdateAdminSettings } from "../../hooks/useAdminSettings";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { MenuImportPreviewModal, type MenuImportPreview } from "../../components/admin/MenuImportPreviewModal";

interface MenuItem {
  id?: string;
  _id?: string;
  name: string;
  description: string;
  price: number | null;
  // null = menu-only (the default). A number makes the item redeemable —
  // set right here, next to the item it applies to, instead of on a
  // separate Rewards page disconnected from the menu it's describing.
  pointsPrice: number | null;
  category: string;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

const itemId = (i: MenuItem) => i.id || (i._id as string);

function useMenu() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<MenuItem[]>({
    queryKey: ["adminMenu", orgId],
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<MenuImportPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Available" | "Sold out">("All");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const menuEnabled = settings?.menuEnabled ?? false;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminMenu"] });

  const downloadTemplate = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const res = await fetch(apiUrl("/api/admin/menu/template"), {
      headers: {
        Authorization: `Bearer ${token}`,
        ...tenantHeaders(),
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

  const previewFile = async (file: File) => {
    setPreviewing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiRequest<MenuImportPreview & { success: boolean }>(
        "/api/admin/menu/import/preview",
        { method: "POST", role: "admin", body: form },
      );
      setPreview(res);
      setPreviewOpen(true);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't read that file — check the format.");
    } finally {
      setPreviewing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setApproving(true);
    try {
      const rows = preview.rows.filter((r) => r.status !== "unchanged");
      const res = await apiRequest<{ success: boolean; created: number; updated: number }>(
        "/api/admin/menu/import/confirm",
        { method: "POST", role: "admin", body: { rows } },
      );
      toast.success(`${res.created} added, ${res.updated} updated.`);
      invalidate();
      setPreviewOpen(false);
      setPreview(null);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't import that — try again.");
    } finally {
      setApproving(false);
    }
  };

  const createItem = useMutation({
    mutationFn: (body: typeof draft) =>
      apiRequest("/api/admin/menu", {
        method: "POST",
        role: "admin",
        body: { ...body, price: body.price.trim() === "" ? undefined : Number(body.price) },
      }),
    onSuccess: () => {
      invalidate();
      setDraft({ name: "", description: "", price: "", category: "General" });
      toast.success("Item added!");
    },
    onError: (e) => toast.error((e as Error).message || "Couldn't add that — try again."),
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
      toast.success("Item removed.");
    },
  });

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category || "General"))), [items]);
  const redeemableCount = useMemo(
    () => items.filter((i) => i.pointsPrice !== null && i.pointsPrice !== undefined).length,
    [items],
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter !== "All" && (i.category || "General") !== categoryFilter) return false;
      if (statusFilter === "Available" && !i.isAvailable) return false;
      if (statusFilter === "Sold out" && i.isAvailable) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, categoryFilter, statusFilter]);

  return (
    <div className="max-w-[860px]">
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Menu</h1>
      <p className="mb-5 text-[var(--muted)]">A display-only menu customers can browse in the app.</p>

      {/* Toggle */}
      <div className="mb-5 flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
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
      <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
        <div className="mb-1 text-sm font-bold">Import from Excel</div>
        <p className="mb-3 text-[13px] text-[var(--muted)]">
          Columns: Name (required), Price, Points Price, Category, Description. You'll review what will change before anything is saved.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) previewFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-btn)] border-2 border-dashed px-6 py-8 text-center transition-colors"
          style={{
            borderColor: dragActive ? "var(--brand)" : "var(--line)",
            background: dragActive ? "var(--plat-soft)" : "var(--bg)",
          }}
        >
          <UploadCloud className="h-6 w-6" style={{ color: "var(--primary-deep)" }} />
          <div className="text-sm font-bold text-[var(--ink)]">
            {previewing ? "Reading your file…" : "Drag your .xlsx file here, or click to choose one"}
          </div>
          <div className="text-[12px] text-[var(--muted)]">.xlsx or .xls, up to 5MB</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) previewFile(file);
            }}
          />
        </div>

        <button
          onClick={downloadTemplate}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-bold"
        >
          <Download className="h-4 w-4" /> Download template
        </button>
      </div>

      {/* Add item */}
      <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
        <div className="mb-3 text-sm font-bold">Add an item</div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            placeholder="Price"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            placeholder="Category"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <button
          onClick={() => draft.name.trim() && createItem.mutate(draft)}
          disabled={createItem.isPending || !draft.name.trim()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[11px] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--primary)" }}
        >
          <Plus className="h-4 w-4" /> Add item
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-1 min-w-[160px] items-center gap-2 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5">
          <Search className="h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items"
            className="w-full bg-transparent text-sm focus:outline-none"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="All">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="All">All statuses</option>
          <option value="Available">Available</option>
          <option value="Sold out">Sold out</option>
        </select>
      </div>

      {/* List */}
      <div style={{ opacity: menuEnabled ? 1 : 0.55 }}>
        {isLoading ? (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <Skeleton className="mb-1.5 h-3.5 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-3.5 w-10" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">
            {items.length === 0 ? "No menu items yet. Add your first above." : "No items match these filters."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient">
            {filteredItems.map((i) => (
              <div
                key={itemId(i)}
                className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold">{i.name}</div>
                  <div className="truncate text-[13px] text-[var(--muted)]">
                    {i.category || "General"}
                    {i.description ? ` · ${i.description}` : ""}
                  </div>
                </div>
                <span className="text-sm font-bold">{typeof i.price === "number" ? i.price : "—"}</span>
                <label
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5"
                  title="Points price — leave blank to keep this item menu-only"
                >
                  <input
                    type="number"
                    min={0}
                    defaultValue={i.pointsPrice ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const next = raw === "" ? null : Number(raw);
                      if (next === (i.pointsPrice ?? null)) return;
                      patchItem.mutate({ id: itemId(i), body: { pointsPrice: next } });
                      toast.success(next === null ? `${i.name} is menu-only now.` : `${i.name} costs ${next} points.`);
                    }}
                    className="w-14 bg-transparent text-sm focus:outline-none"
                  />
                  <span className="text-[11px] text-[var(--muted)]">pts</span>
                </label>
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
                  onClick={() => setPendingDeleteId(itemId(i))}
                  className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--err)]"
                  aria-label={`Delete ${i.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2.5 text-[13px] text-[var(--soft)]">
        Give an item a points price to make it redeemable — leave it blank to keep it menu-only.
        {redeemableCount > 0 ? ` ${redeemableCount} item${redeemableCount === 1 ? " is" : "s are"} redeemable.` : ""}
      </p>

      <MenuImportPreviewModal
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreview(null);
        }}
        preview={preview}
        onApprove={confirmImport}
        approving={approving}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete this item?"
        description={
          pendingDeleteId
            ? `"${items.find((i) => itemId(i) === pendingDeleteId)?.name ?? ""}" will be removed from your menu.`
            : ""
        }
        confirmLabel="Delete"
        confirmColor="var(--err)"
        onConfirm={() => {
          if (pendingDeleteId) deleteItem.mutate(pendingDeleteId);
        }}
      />
    </div>
  );
}
