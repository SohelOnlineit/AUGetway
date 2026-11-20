"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type {
  AdminContactDetail,
  ContactInquiryStatusPublic,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

export default function AdminContactDetailPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [item, setItem] = useState<AdminContactDetail | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError || !params.id) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminContactDetail>(
        `/contact/${params.id}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItem(result.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, sessionError]);

  const canWrite = can(permissions, "admin:contact:write");

  async function updateStatus(status: ContactInquiryStatusPublic) {
    if (!item) return;
    const result = await adminFetch<AdminContactDetail>(`/contact/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setItem(result.data);
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    const result = await adminFetch<AdminContactDetail>(
      `/contact/${item.id}/reply`,
      {
        method: "POST",
        body: JSON.stringify({ body: reply }),
      },
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setItem(result.data);
    setReply("");
  }

  return (
    <AdminShell title="Contact inquiry" permissions={permissions}>
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      {!item ? <p>Loading…</p> : null}
      {item ? (
        <>
          <p className="lead">
            {item.status} · {item.name} · {item.email}
          </p>
          <h2>{item.subject}</h2>
          {canWrite ? (
            <div className="admin-toolbar">
              <button type="button" onClick={() => void updateStatus("CLOSED")}>
                Close
              </button>
              <button type="button" onClick={() => void updateStatus("READ")}>
                Mark read
              </button>
            </div>
          ) : null}
          <div className="order-list">
            {item.messages.map((msg) => (
              <div key={msg.id} className="order-row">
                <div>
                  <strong>{msg.direction}</strong>
                  <p>{msg.body}</p>
                  <p>
                    Delivery: {msg.deliveryStatus}
                    {msg.deliveryDetail ? ` — ${msg.deliveryDetail}` : ""}
                  </p>
                </div>
                <span>{formatBangladeshDateTime(msg.createdAt)}</span>
              </div>
            ))}
          </div>
          {canWrite ? (
            <form className="account-stack" onSubmit={(e) => void sendReply(e)}>
              <label>
                Reply
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  required
                />
              </label>
              <button className="primary-btn" type="submit">
                Save reply (email only if provider ready)
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </AdminShell>
  );
}
