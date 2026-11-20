"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { PublicTicketDetail } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const replyId = useId();
  const [ticket, setTicket] = useState<PublicTicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/tickets/${params.id}`);
    if (response.status === 401) {
      router.replace(`/login?next=/tickets/${params.id}`);
      return;
    }
    if (response.status === 404) {
      setError("Ticket not found");
      setLoading(false);
      return;
    }
    if (!response.ok) {
      setError("Unable to load ticket");
      setLoading(false);
      return;
    }
    setTicket((await response.json()) as PublicTicketDetail);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id-driven reload
  }, [params.id, router]);

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (reply.trim().length < 1) return;
    setPending(true);
    setFormError(null);
    const response = await fetch(`/api/tickets/${params.id}/replies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: reply.trim(),
        idempotencyKey: `web-reply-${params.id}-${Date.now()}`,
      }),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      setFormError(
        Array.isArray(payload.message)
          ? payload.message.join(", ")
          : payload.message || "Reply failed",
      );
      return;
    }
    setTicket((await response.json()) as PublicTicketDetail);
    setReply("");
  }

  async function statusAction(action: "close" | "reopen") {
    setPending(true);
    const response = await fetch(`/api/tickets/${params.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reason: `${action} from customer UI` }),
    });
    setPending(false);
    if (!response.ok) {
      setFormError("Status update failed");
      return;
    }
    setTicket((await response.json()) as PublicTicketDetail);
  }

  return (
    <AccountShell title="Ticket" lead="Owner-only ticket thread and live chat.">
      <AccountState loading={loading} error={error}>
        {ticket ? (
          <div className="account-stack">
            <ul className="meta">
              <li>
                Number: <code>{ticket.ticketNumber}</code>
              </li>
              <li>
                Status: <strong>{ticket.status}</strong>
              </li>
              <li>Priority: {ticket.priority}</li>
              <li>Subject: {ticket.subject}</li>
            </ul>

            <h2>Messages</h2>
            <div className="order-list">
              {ticket.messages.map((message) => (
                <div key={message.id} className="order-row">
                  <div>
                    <strong>
                      {message.authorIsStaff
                        ? "Support"
                        : message.authorDisplayName || "You"}
                    </strong>
                    <p>{message.body}</p>
                  </div>
                  <span>{formatBangladeshDateTime(message.createdAt)}</span>
                </div>
              ))}
            </div>

            {ticket.status !== "CLOSED" ? (
              <form className="account-stack" onSubmit={(e) => void sendReply(e)}>
                {formError ? <p className="form-error">{formError}</p> : null}
                <label htmlFor={replyId}>
                  Reply
                  <textarea
                    id={replyId}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    required
                  />
                </label>
                <button type="submit" className="primary-btn" disabled={pending}>
                  Send reply
                </button>
              </form>
            ) : null}

            <div className="admin-toolbar">
              {ticket.status === "CLOSED" ? (
                <button
                  type="button"
                  className="primary-btn"
                  disabled={pending}
                  onClick={() => void statusAction("reopen")}
                >
                  Reopen
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-btn"
                  disabled={pending}
                  onClick={() => void statusAction("close")}
                >
                  Close ticket
                </button>
              )}
            </div>

            {ticket.chatRoomId ? (
              <div className="account-stack">
                <h2>Live chat</h2>
                <ChatPanel key={ticket.chatRoomId} roomId={ticket.chatRoomId} />
                <p className="auth-links">
                  <Link href={`/chat/${ticket.chatRoomId}`}>Open full chat</Link>
                </p>
              </div>
            ) : null}

            <p className="auth-links">
              <Link href="/tickets">All tickets</Link>
              {" · "}
              <Link href="/chat">Chat rooms</Link>
            </p>
          </div>
        ) : null}
      </AccountState>
    </AccountShell>
  );
}
