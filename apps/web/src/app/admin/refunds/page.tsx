"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AdminPage,
  AdminRefundListItem,
  RefundStatusPublic,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, formatMinor } from "@/lib/admin/api";

export default function AdminRefundsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rows, setRows] = useState<AdminRefundListItem[]>([]);
  const [status, setStatus] = useState<"" | RefundStatusPublic>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const result = await adminFetch<AdminPage<AdminRefundListItem>>(
        `/refunds?${params.toString()}`,
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
  }, [loading, q, sessionError, status]);

  return (
    <AdminShell
      title="Refunds"
      lead="Approve, process, and record external results. Open refunds never mark an order fully refunded."
      permissions={permissions}
    >
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      <div className="admin-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search refund id, order #, email"
        />
        <FilterMenu
          label="Refund status"
          value={status}
          onChange={(value) => setStatus(value as "" | RefundStatusPublic)}
          options={[
            { value: "", label: "All statuses" },
            { value: "REQUESTED", label: "REQUESTED" },
            { value: "APPROVED", label: "APPROVED" },
            { value: "REJECTED", label: "REJECTED" },
            { value: "PROCESSING", label: "PROCESSING" },
            { value: "SUCCEEDED", label: "SUCCEEDED" },
            { value: "FAILED", label: "FAILED" },
            { value: "CANCELLED", label: "CANCELLED" },
          ]}
        />
      </div>
      <div className="order-list">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/admin/refunds/${row.id}`}
            className="order-row"
          >
            <div>
              <strong>{row.orderNumber}</strong>
              <p>
                {row.status} · {row.customerEmail} · {row.destination}
              </p>
            </div>
            <strong>{formatMinor(row.amountMinor, row.currency)}</strong>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
