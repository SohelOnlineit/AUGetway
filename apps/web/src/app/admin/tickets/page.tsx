"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminPage, AdminTicketListItem, TicketStatusPublic } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

const STATUSES: Array<{ id: "" | TicketStatusPublic; label: string }> = [
  { id: "", label: "All" },
  { id: "OPEN", label: "Open" },
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "WAITING_CUSTOMER", label: "Waiting" },
  { id: "RESOLVED", label: "Resolved" },
  { id: "CLOSED", label: "Closed" },
];

function statusLabel(status: TicketStatusPublic) {
  return STATUSES.find((item) => item.id === status)?.label ?? status;
}

function statusTone(status: TicketStatusPublic) {
  if (status === "RESOLVED" || status === "CLOSED") return "is-success";
  if (status === "WAITING_CUSTOMER") return "is-amber";
  return "is-brand";
}

export default function AdminTicketsPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rows, setRows] = useState<AdminTicketListItem[]>([]);
  const [status, setStatus] = useState<"" | TicketStatusPublic>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const result = await adminFetch<AdminPage<AdminTicketListItem>>(`/tickets?${params.toString()}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setReady(true);
        return;
      }
      setRows(result.data.items);
      setError(null);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, q, sessionError, status]);

  const stats = useMemo(() => {
    const open = rows.filter((row) => row.status === "OPEN" || row.status === "IN_PROGRESS").length;
    const waiting = rows.filter((row) => row.status === "WAITING_CUSTOMER").length;
    const done = rows.filter((row) => row.status === "RESOLVED" || row.status === "CLOSED").length;
    const urgent = rows.filter((row) => row.priority === "HIGH" || row.priority === "URGENT").length;
    return { total: rows.length, open, waiting, done, urgent };
  }, [rows]);

  return (
    <AdminShell title="Support tickets" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!ready ? (
        <p className="mail-loading">{sessionError ? "" : "Loading tickets…"}</p>
      ) : (
        <div className="ticket-page">
          <header className="ticket-hero">
            <span className="ticket-hero-icon" aria-hidden>
              <span className="ticket-ring" />
              <HeadsetIcon />
            </span>
            <div>
              <p>Support</p>
              <h1>Support tickets</h1>
              <p>Customer requests, replies, and status updates in one desk.</p>
            </div>
          </header>

          <div className="ticket-stats">
            <article className="is-brand">
              <span className="ticket-stat-icon" aria-hidden><TicketIcon /></span>
              <div>
                <span>In view</span>
                <strong>{stats.total}</strong>
                <em>Latest 50 tickets</em>
              </div>
            </article>
            <article className="is-brand">
              <span className="ticket-stat-icon" aria-hidden><PulseIcon /></span>
              <div>
                <span>Open</span>
                <strong>{stats.open}</strong>
                <em>Open or in progress</em>
              </div>
            </article>
            <article className="is-amber">
              <span className="ticket-stat-icon" aria-hidden><ClockIcon /></span>
              <div>
                <span>Waiting</span>
                <strong>{stats.waiting}</strong>
                <em>Needs a customer reply</em>
              </div>
            </article>
            <article className={stats.urgent > 0 ? "is-amber" : "is-success"}>
              <span className="ticket-stat-icon" aria-hidden><FlagIcon /></span>
              <div>
                <span>{stats.urgent > 0 ? "Urgent" : "Settled"}</span>
                <strong>{stats.urgent > 0 ? stats.urgent : stats.done}</strong>
                <em>{stats.urgent > 0 ? "High or urgent priority" : "Resolved or closed"}</em>
              </div>
            </article>
          </div>

          <section className="ticket-card">
            <header className="ticket-card-head">
              <span className="ticket-stat-icon" aria-hidden><SearchIcon /></span>
              <div>
                <h2>Find a ticket</h2>
                <p>Search by number, subject, or customer email.</p>
              </div>
            </header>
            <label className="ticket-search">
              <span>Search</span>
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ticket #, subject, or email" />
            </label>
            <div className="ticket-statuses" role="tablist" aria-label="Ticket status">
              {STATUSES.map((item) => (
                <button
                  key={item.id || "all"}
                  type="button"
                  role="tab"
                  aria-selected={status === item.id}
                  className={status === item.id ? "is-on" : ""}
                  onClick={() => setStatus(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          {rows.length === 0 ? (
            <section className="ticket-card ticket-empty">
              <span className="ticket-hero-icon" aria-hidden>
                <span className="ticket-ring" />
                <HeadsetIcon />
              </span>
              <h2>No tickets</h2>
              <p>Nothing matches this search or status.</p>
            </section>
          ) : (
            <div className="ticket-list">
              {rows.map((row, index) => (
                <Link
                  key={row.id}
                  href={`/admin/tickets/${row.id}`}
                  className={`ticket-row ${statusTone(row.status)}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <span className="ticket-mark" aria-hidden>
                    <span className="ticket-ring" />
                    <TicketIcon />
                  </span>
                  <div>
                    <strong>
                      {row.ticketNumber}
                      <em className={`ticket-pill ${statusTone(row.status)}`}>{statusLabel(row.status)}</em>
                      {row.priority === "HIGH" || row.priority === "URGENT" ? (
                        <em className="ticket-pill is-amber">{row.priority === "URGENT" ? "Urgent" : "High"}</em>
                      ) : null}
                    </strong>
                    <p>{row.subject}</p>
                    <small>{row.customerEmail} · {row.messageCount} message{row.messageCount === 1 ? "" : "s"}</small>
                  </div>
                  <time dateTime={row.updatedAt}>{formatBangladeshDateTime(row.updatedAt)}</time>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 13a8 8 0 0 1 16 0" />
      <path d="M4 13v4a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2Z" />
      <path d="M20 13v4a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2Z" />
      <path d="M18 19a4 4 0 0 1-4 2h-2" />
    </svg>
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

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12h4l2-5 3 10 2-5h7" />
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
