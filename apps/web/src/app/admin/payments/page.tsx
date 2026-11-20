"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AdminPage,
  AdminPaymentListItem,
  PaymentIntentStatusPublic,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, formatMinor } from "@/lib/admin/api";

export default function AdminPaymentsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rows, setRows] = useState<AdminPaymentListItem[]>([]);
  const [status, setStatus] = useState<"" | PaymentIntentStatusPublic>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const result = await adminFetch<AdminPage<AdminPaymentListItem>>(
        `/payments?${params.toString()}`,
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
      title="Payments"
      lead="Provider-agnostic payment intents. Refund totals exclude open requests."
      permissions={permissions}
    >
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      <div className="admin-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search order #, email, or ref"
        />
        <FilterMenu
          label="Payment status"
          value={status}
          onChange={(value) => setStatus(value as "" | PaymentIntentStatusPublic)}
          options={[
            { value: "", label: "All statuses" },
            { value: "REQUIRES_CONFIRMATION", label: "REQUIRES_CONFIRMATION" },
            { value: "PROCESSING", label: "PROCESSING" },
            { value: "SUCCEEDED", label: "SUCCEEDED" },
            { value: "FAILED", label: "FAILED" },
            { value: "EXPIRED", label: "EXPIRED" },
            { value: "CANCELLED", label: "CANCELLED" },
          ]}
        />
      </div>
      <div className="order-list">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/admin/payments/${row.id}`}
            className="order-row"
          >
            <div>
              <strong>{row.orderNumber}</strong>
              <p>
                {row.status} · {row.provider} · {row.customerEmail}
              </p>
              {row.paymentMethod || row.transactionId ? (
                <p>{[row.paymentMethod, row.transactionId].filter(Boolean).join(" · ")}</p>
              ) : null}
            </div>
            <div>
              <strong>{formatMinor(row.amountMinor, row.currency)}</strong>
              <p>
                refunded {formatMinor(row.refundedMinor, row.currency)}
                {row.pendingRefundMinor > 0
                  ? ` · pending ${formatMinor(row.pendingRefundMinor, row.currency)}`
                  : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
