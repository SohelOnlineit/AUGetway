"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AdminTicketDetail, TicketPriorityPublic, TicketStatusPublic } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch, can } from "@/lib/admin/api";

const STATUS_LABEL: Record<TicketStatusPublic, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_CUSTOMER: "Waiting",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const PRIORITY_LABEL: Record<TicketPriorityPublic, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export default function AdminTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [ticket, setTicket] = useState<AdminTicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState("");
  const [reason, setReason] = useState("Staff ticket update");
  const [status, setStatus] = useState<TicketStatusPublic>("OPEN");
  const [priority, setPriority] = useState<TicketPriorityPublic>("NORMAL");

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminTicketDetail>(`/tickets/${params.id}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTicket(result.data);
      setStatus(result.data.status);
      setPriority(result.data.priority);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, sessionError]);

  async function saveMeta(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 8) {
      setError("Reason is required (min 8 characters)");
      return;
    }
    setPending(true);
    setNotice(null);
    const result = await adminFetch<AdminTicketDetail>(`/tickets/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        priority,
        assignedToUserId: ticket?.assignedToUserId ?? undefined,
        reason: reason.trim(),
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTicket(result.data);
    setError(null);
    setNotice("Ticket updated.");
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!reply.trim()) return;
    setPending(true);
    setNotice(null);
    const result = await adminFetch<AdminTicketDetail>(`/tickets/${params.id}/replies`, {
      method: "POST",
      body: JSON.stringify({
        body: reply.trim(),
        idempotencyKey: `admin-reply-${params.id}-${Date.now()}`,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTicket(result.data);
    setReply("");
    setError(null);
    setNotice("Reply sent.");
  }

  const canWrite = can(permissions, "admin:support:write");

  return (
    <AdminShell title="Ticket detail" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!ticket ? (
        <p className="mail-loading">{sessionError || error ? "" : "Loading ticket…"}</p>
      ) : (
        <div className="ticket-page">
          <p className="ticket-back">
            <Link href="/admin/tickets">← Support tickets</Link>
          </p>
          <header className="ticket-hero">
            <span className="ticket-hero-icon" aria-hidden>
              <span className="ticket-ring" />
              <TicketIcon />
            </span>
            <div>
              <p>{ticket.ticketNumber}</p>
              <h1>{ticket.subject}</h1>
              <p>Updated {formatBangladeshDateTime(ticket.updatedAt)}</p>
            </div>
          </header>
          <div className="ticket-stats">
            <article className={ticket.status === "WAITING_CUSTOMER" ? "is-amber" : ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "is-success" : "is-brand"}>
              <span className="ticket-stat-icon" aria-hidden><PulseIcon /></span>
              <div>
                <span>Status</span>
                <strong>{STATUS_LABEL[ticket.status]}</strong>
                <em>{PRIORITY_LABEL[ticket.priority]} priority</em>
              </div>
            </article>
            <article className="is-brand">
              <span className="ticket-stat-icon" aria-hidden><UserIcon /></span>
              <div>
                <span>Customer</span>
                <strong>
                  <Link href={`/admin/customers/${ticket.customerId}`}>{ticket.customerEmail}</Link>
                </strong>
                <em>{ticket.assigneeEmail ? `Assigned to ${ticket.assigneeEmail}` : "Unassigned"}</em>
              </div>
            </article>
            <article className="is-success">
              <span className="ticket-stat-icon" aria-hidden><ChatIcon /></span>
              <div>
                <span>Messages</span>
                <strong>{ticket.messages.length}</strong>
                <em>{ticket.chatRoomId ? <Link href={`/admin/chat?room=${ticket.chatRoomId}`}>Open live chat</Link> : "No live chat"}</em>
              </div>
            </article>
            <article>
              <span className="ticket-stat-icon" aria-hidden><ClockIcon /></span>
              <div>
                <span>Opened</span>
                <strong>{formatBangladeshDateTime(ticket.createdAt)}</strong>
                <em>{ticket.closedAt ? `Closed ${formatBangladeshDateTime(ticket.closedAt)}` : "Still open"}</em>
              </div>
            </article>
          </div>

          <section className="ticket-card">
            <header className="ticket-card-head">
              <span className="ticket-stat-icon" aria-hidden><ChatIcon /></span>
              <div>
                <h2>Conversation</h2>
                <p>Customer messages stay on the left. Staff replies stay on the right.</p>
              </div>
            </header>
            <div className="ticket-thread">
              {ticket.messages.map((message) => (
                <article key={message.id} className={message.authorIsStaff ? "is-staff" : "is-customer"}>
                  <span className="ticket-stat-icon" aria-hidden>{message.authorIsStaff ? <HeadsetIcon /> : <UserIcon />}</span>
                  <div>
                    <strong>{message.authorIsStaff ? "Staff" : message.authorDisplayName || "Customer"}</strong>
                    <p>{message.body}</p>
                    <time dateTime={message.createdAt}>{formatBangladeshDateTime(message.createdAt)}</time>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {canWrite ? (
            <div className="ticket-desk">
              <form className="ticket-card" onSubmit={(event) => void saveMeta(event)}>
                <header className="ticket-card-head">
                  <span className="ticket-stat-icon" aria-hidden><FlagIcon /></span>
                  <div>
                    <h2>Status</h2>
                    <p>A short reason is saved with the change.</p>
                  </div>
                </header>
                <label>
                  <span>Status</span>
                  <select value={status} onChange={(event) => setStatus(event.target.value as TicketStatusPublic)}>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriorityPublic)}>
                    {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Reason</span>
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} minLength={8} required />
                </label>
                <button type="submit" className="ticket-save" disabled={pending}>
                  {pending ? "Saving…" : "Save ticket"}
                </button>
              </form>

              {ticket.status !== "CLOSED" ? (
                <form className="ticket-card" onSubmit={(event) => void sendReply(event)}>
                  <header className="ticket-card-head">
                    <span className="ticket-stat-icon" aria-hidden><SendIcon /></span>
                    <div>
                      <h2>Reply</h2>
                      <p>The customer sees this message on the ticket.</p>
                    </div>
                  </header>
                  <label>
                    <span>Message</span>
                    <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} required />
                  </label>
                  <button type="submit" className="ticket-save" disabled={pending}>
                    {pending ? "Sending…" : "Send reply"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
          {notice ? <p className="ticket-notice">{notice}</p> : null}
        </div>
      )}
    </AdminShell>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" />
      <path d="M12 7v10" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 13a8 8 0 0 1 16 0" />
      <path d="M4 13v4a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2Z" />
      <path d="M20 13v4a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3" />
      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12h4l2-5 3 10 2-5h7" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14v9H8l-3 3V6Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4v16" />
      <path d="M6 5h11l-2 3 2 3H6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-7-6 16-2.5-6.5L4 12Z" />
    </svg>
  );
}
