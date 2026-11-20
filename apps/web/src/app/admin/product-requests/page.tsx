"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AdminPage,
  AdminProductRequestListItem,
  ProductRequestStatusPublic,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

export default function AdminProductRequestsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rows, setRows] = useState<AdminProductRequestListItem[]>([]);
  const [status, setStatus] = useState<"" | ProductRequestStatusPublic>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      const result = await adminFetch<AdminPage<AdminProductRequestListItem>>(
        `/product-requests?${params.toString()}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRows(result.data.items);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError, status]);

  return (
    <AdminShell
      title="Product requests"
      lead="Customer product requests with review/status workflow."
      permissions={permissions}
    >
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      <div className="admin-toolbar">
        <FilterMenu
          label="Request status"
          value={status}
          onChange={(value) => setStatus(value as "" | ProductRequestStatusPublic)}
          options={[
            { value: "", label: "All" },
            { value: "NEW", label: "NEW" },
            { value: "REVIEWING", label: "REVIEWING" },
            { value: "REPLIED", label: "REPLIED" },
            { value: "CLOSED", label: "CLOSED" },
          ]}
        />
      </div>
      <div className="order-list">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/admin/product-requests/${row.id}`}
            className="order-row"
          >
            <div>
              <strong>{row.productName}</strong>
              <p>
                {row.status} · {row.customerName} · {row.email}
              </p>
            </div>
            <span>{formatBangladeshDateTime(row.createdAt)}</span>
          </Link>
        ))}
        {rows.length === 0 && !loading ? (
          <p className="empty-state">No requests.</p>
        ) : null}
      </div>
    </AdminShell>
  );
}
