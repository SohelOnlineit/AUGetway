"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminPaymentDetail } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, formatMinor } from "@/lib/admin/api";

export default function AdminPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [payment, setPayment] = useState<AdminPaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminPaymentDetail>(
        `/payments/${params.id}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPayment(result.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, sessionError]);

  return (
    <AdminShell title="Payment detail" permissions={permissions}>
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      {!payment ? <p>Loading…</p> : null}
      {payment ? (
        <div className="account-stack">
          <ul className="meta">
            <li>
              Intent: <code>{payment.id}</code>
            </li>
            <li>
              Order:{" "}
              <Link href={`/admin/orders/${payment.orderId}`}>
                {payment.orderNumber}
              </Link>
            </li>
            <li>Customer: {payment.customerEmail}</li>
            <li>
              Status: <strong>{payment.status}</strong>
            </li>
            <li>Provider: {payment.provider}</li>
            <li>
              Amount: {formatMinor(payment.amountMinor, payment.currency)}
            </li>
            <li>
              Refunded (succeeded):{" "}
              {formatMinor(payment.refundedMinor, payment.currency)}
            </li>
            <li>
              Pending refunds:{" "}
              {formatMinor(payment.pendingRefundMinor, payment.currency)}
            </li>
            <li>
              External ref:{" "}
              <code>{payment.externalRef || "—"}</code>
            </li>
            <li>
              Succeeded:{" "}
              {payment.succeededAt
                ? formatBangladeshDateTime(payment.succeededAt)
                : "—"}
            </li>
            <li>Created: {formatBangladeshDateTime(payment.createdAt)}</li>
          </ul>

          <h2>Events</h2>
          <div className="order-list">
            {payment.events.map((event) => (
              <div key={event.id} className="order-row">
                <div>
                  <strong>{event.kind}</strong>
                  <p>
                    <code>{event.providerEventId}</code>
                  </p>
                </div>
                <span>{formatBangladeshDateTime(event.createdAt)}</span>
              </div>
            ))}
          </div>

          <h2>Refunds</h2>
          <div className="order-list">
            {payment.refunds.length === 0 ? (
              <p className="empty-state">No refunds on this payment.</p>
            ) : (
              payment.refunds.map((refund) => (
                <Link
                  key={refund.id}
                  href={`/admin/refunds/${refund.id}`}
                  className="order-row"
                >
                  <div>
                    <strong>{refund.status}</strong>
                    <p>{refund.reason}</p>
                  </div>
                  <strong>
                    {formatMinor(refund.amountMinor, refund.currency)}
                  </strong>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
