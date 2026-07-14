import { Download } from "lucide-react";
import { getTenantSlug } from "../../lib/api";

export default function AdminReportsCustomers() {
  const download = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const slug = getTenantSlug();
    const res = await fetch("/api/admin/reports/customers/download", {
      headers: { Authorization: `Bearer ${token}`, ...(slug ? { "X-Tenant-Slug": slug } : {}) },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[560px]">
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Customer report</h1>
      <p className="mb-6 text-[var(--muted)]">
        Download every customer's contact info, stamp progress, and lifetime totals as an Excel file.
      </p>
      <button
        onClick={download}
        className="inline-flex items-center gap-1.5 rounded-[12px] px-5 py-3 text-sm font-bold text-white"
        style={{ background: "var(--brand)" }}
      >
        <Download className="h-4 w-4" /> Download Excel
      </button>
    </div>
  );
}
