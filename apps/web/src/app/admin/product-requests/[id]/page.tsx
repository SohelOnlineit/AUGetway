"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type {
  AdminProductRequestDetail,
  ProductRequestStatusPublic,
} from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

export default function AdminProductRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [item, setItem] = useState<AdminProductRequestDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError || !params.id) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminProductRequestDetail>(
        `/product-requests/${params.id}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItem(result.data);
      setReply(result.data.adminReply ?? "");
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, sessionError]);

  const canWrite = can(permissions, "admin:product-requests:write");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    const result = await adminFetch<AdminProductRequestDetail>(
      `/product-requests/${item.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: item.status,
          adminReply: reply,
          sendEmail,
        }),
      },
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setItem(result.data);
    setSendEmail(false);
  }

  return (
    <AdminShell title="Product request" permissions={permissions}>
      {sessionError || error ? (
        <p className="form-error">{sessionError || error}</p>
      ) : null}
      {!item ? <p>Loading…</p> : null}
      {item ? (
        <form className="account-stack" onSubmit={(e) => void save(e)}>
          <p className="lead">
            {item.customerName} · {item.email} · {item.mobile}
          </p>
          <h2>{item.productName}</h2>
          <p>{item.details}</p>
          <label>
            Status
            <select
              value={item.status}
              disabled={!canWrite}
              onChange={(e) =>
                setItem({
                  ...item,
                  status: e.target.value as ProductRequestStatusPublic,
                })
              }
            >
              <option value="NEW">NEW</option>
              <option value="REVIEWING">REVIEWING</option>
              <option value="REPLIED">REPLIED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
          <label>
            Admin reply
            <textarea
              value={reply}
              disabled={!canWrite}
              onChange={(e) => setReply(e.target.value)}
              rows={5}
            />
          </label>
          <p className="lead">
            Reply delivery: {item.replyDeliveryStatus}
            {item.replyDeliveryDetail ? ` — ${item.replyDeliveryDetail}` : ""}
          </p>
          {canWrite ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                />{" "}
                Attempt email (will mark SKIPPED_NO_PROVIDER if mail is noop)
              </label>
              <button className="primary-btn" type="submit">
                Save
              </button>
            </>
          ) : null}
        </form>
      ) : null}
    </AdminShell>
  );
}
