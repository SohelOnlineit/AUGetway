"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicRefundDetail } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { formatPrice } from "@/lib/catalog/format";

export default function RefundDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [refund, setRefund] = useState<PublicRefundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/refunds/${params.id}`);
      if (cancelled) return;
      if (response.status === 401) {
        router.replace(`/login?next=/refunds/${params.id}`);
        return;
      }
      if (response.status === 404) {
        setError("Refund not found");
        setLoading(false);
        return;
      }
      if (!response.ok) {
        setError("Unable to load refund");
        setLoading(false);
        return;
      }
      setRefund((await response.json()) as PublicRefundDetail);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  return (
    <AccountShell title="Refund detail" lead="Owner-only refund history.">
      <AccountState loading={loading} error={error}>
        {refund ? (
          <div className="account-stack">
            <ul className="meta">
              <li>
                Order:{" "}
                <Link href={`/orders/${refund.orderId}`}>
                  <code>{refund.orderNumber}</code>
                </Link>
              </li>
              <li>
                Status: <strong>{refund.status}</strong>
              </li>
              <li>Destination: {refund.destination}</li>
              <li>
                Amount: {formatPrice(refund.amountMinor, refund.currency)}
              </li>
              <li>Reason: {refund.reason}</li>
              {refund.providerRef ? (
                <li>
                  Provider ref: <code>{refund.providerRef}</code>
                </li>
              ) : null}
              <li>Requested: {formatBangladeshDateTime(refund.createdAt)}</li>
              <li>Updated: {formatBangladeshDateTime(refund.updatedAt)}</li>
            </ul>
            <h2>History</h2>
            <div className="order-list">
              {refund.history.map((item) => (
                <div key={item.id} className="order-row">
                  <div>
                    <strong>
                      {item.fromStatus ?? "—"} → {item.toStatus}
                    </strong>
                    <p>{item.reason || "No reason recorded"}</p>
                  </div>
                  <span>{formatBangladeshDateTime(item.createdAt)}</span>
                </div>
              ))}
            </div>
            <p className="auth-links">
              <Link href="/refunds">All refunds</Link>
              {" · "}
              <Link href={`/orders/${refund.orderId}`}>Back to order</Link>
            </p>
          </div>
        ) : null}
      </AccountState>
    </AccountShell>
  );
}
