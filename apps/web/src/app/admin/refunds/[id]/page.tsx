"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  AdminRefundAction,
  AdminRefundDetail,
  RefundDestinationPublic,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can, formatMinor } from "@/lib/admin/api";

export default function AdminRefundDetailPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [refund, setRefund] = useState<AdminRefundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [destination, setDestination] =
    useState<RefundDestinationPublic>("ORIGINAL_PROVIDER");
  const [providerRef, setProviderRef] = useState("");
  const [recordResult, setRecordResult] = useState<"success" | "failure">(
    "success",
  );
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminRefundDetail>(
        `/refunds/${params.id}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRefund(result.data);
      setDestination(result.data.destination);
      setProviderRef(result.data.providerRef ?? "");
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, reloadToken, sessionError]);

  async function runAction(action: AdminRefundAction) {
    if (reason.trim().length < 8) {
      setError("Reason is required (min 8 characters)");
      return;
    }
    setPending(true);
    const body: Record<string, string> = {
      action,
      reason: reason.trim(),
      destination,
    };
    if (action === "RECORD_RESULT") {
      body.result = recordResult;
      if (providerRef.trim()) body.providerRef = providerRef.trim();
    }
    const result = await adminFetch<AdminRefundDetail>(
      `/refunds/${params.id}/actions`,
      { method: "POST", body: JSON.stringify(body) },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRefund(result.data);
    setReason("");
    setReloadToken((value) => value + 1);
  }

  async function sandboxSimulate(outcome: "success" | "failure") {
    if (reason.trim().length < 8) {
      setError("Reason is required for sandbox simulation");
      return;
    }
    setPending(true);
    const result = await adminFetch<AdminRefundDetail>(
      `/refunds/${params.id}/sandbox-simulate`,
      {
        method: "POST",
        body: JSON.stringify({ outcome, reason: reason.trim() }),
      },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRefund(result.data);
    setReason("");
    setReloadToken((value) => value + 1);
  }

  const canWrite = can(permissions, "admin:refunds:write");

  return (
    <AdminShell title="Refund detail" permissions={permissions}>
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      {!refund ? <p>Loading…</p> : null}
      {refund ? (
        <div className="account-stack">
          <ul className="meta">
            <li>
              Refund: <code>{refund.id}</code>
            </li>
            <li>
              Order:{" "}
              <Link href={`/admin/orders/${refund.orderId}`}>
                {refund.orderNumber}
              </Link>
            </li>
            <li>
              Customer:{" "}
              <Link href={`/admin/customers/${refund.customerId}`}>
                {refund.customerEmail}
              </Link>
            </li>
            <li>
              Status: <strong>{refund.status}</strong>
            </li>
            <li>Destination: {refund.destination}</li>
            <li>
              Amount: {formatMinor(refund.amountMinor, refund.currency)}
            </li>
            <li>Reason: {refund.reason}</li>
            <li>
              Provider ref: <code>{refund.providerRef || "—"}</code>
            </li>
            {refund.payment ? (
              <li>
                Payment:{" "}
                <Link href={`/admin/payments/${refund.payment.id}`}>
                  {refund.payment.provider} · {refund.payment.status}
                </Link>
              </li>
            ) : null}
            <li>Created: {formatBangladeshDateTime(refund.createdAt)}</li>
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
                  <p>{item.reason || "—"}</p>
                </div>
                <span>{formatBangladeshDateTime(item.createdAt)}</span>
              </div>
            ))}
          </div>

          {canWrite && refund.allowedActions.length > 0 ? (
            <div className="account-stack">
              <h2>Actions</h2>
              <p className="lead">
                Reason and audit are required. External gateway refunds stay
                pending until you record the result. Choose WALLET only when
                crediting the customer wallet ledger intentionally.
              </p>
              <label>
                Reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  minLength={8}
                  required
                />
              </label>
              <label>
                Destination
                <select
                  value={destination}
                  onChange={(e) =>
                    setDestination(e.target.value as RefundDestinationPublic)
                  }
                >
                  <option value="ORIGINAL_PROVIDER">ORIGINAL_PROVIDER</option>
                  <option value="WALLET">WALLET</option>
                </select>
              </label>
              {refund.allowedActions.includes("RECORD_RESULT") ? (
                <>
                  <label>
                    Result
                    <select
                      value={recordResult}
                      onChange={(e) =>
                        setRecordResult(
                          e.target.value as "success" | "failure",
                        )
                      }
                    >
                      <option value="success">success</option>
                      <option value="failure">failure</option>
                    </select>
                  </label>
                  <label>
                    Provider reference
                    <input
                      value={providerRef}
                      onChange={(e) => setProviderRef(e.target.value)}
                      placeholder="External refund reference"
                    />
                  </label>
                </>
              ) : null}
              <div className="admin-toolbar">
                {refund.allowedActions.includes("APPROVE") ? (
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={pending}
                    onClick={() => void runAction("APPROVE")}
                  >
                    Approve
                  </button>
                ) : null}
                {refund.allowedActions.includes("REJECT") ? (
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={pending}
                    onClick={() => void runAction("REJECT")}
                  >
                    Reject
                  </button>
                ) : null}
                {refund.allowedActions.includes("MARK_PROCESSING") ? (
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={pending}
                    onClick={() => void runAction("MARK_PROCESSING")}
                  >
                    Mark processing
                  </button>
                ) : null}
                {refund.allowedActions.includes("RECORD_RESULT") ? (
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={pending}
                    onClick={() => void runAction("RECORD_RESULT")}
                  >
                    Record result
                  </button>
                ) : null}
              </div>
              {refund.status === "PROCESSING" ? (
                <div className="admin-toolbar">
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={pending}
                    onClick={() => void sandboxSimulate("success")}
                  >
                    Sandbox simulate success (dev)
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={pending}
                    onClick={() => void sandboxSimulate("failure")}
                  >
                    Sandbox simulate failure (dev)
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </AdminShell>
  );
}
