"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminAuditListItem, AdminPage } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

function tone(action: string) {
  const value = action.toLowerCase();
  if (value.includes("delete") || value.includes("fail") || value.includes("block")) return "is-amber";
  if (value.includes("create") || value.includes("login") || value.includes("enable")) return "is-success";
  return "is-brand";
}

export default function AdminAuditPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [rows, setRows] = useState<AdminAuditListItem[]>([]);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (action.trim()) params.set("action", action.trim());
      if (entityType.trim()) params.set("entityType", entityType.trim());
      const result = await adminFetch<AdminPage<AdminAuditListItem>>(
        `/audit?${params.toString()}`,
      );
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
  }, [action, entityType, loading, sessionError]);

  const stats = useMemo(() => {
    const actors = new Set(rows.map((row) => row.actorEmail || row.actorUserId || "system")).size;
    const actions = new Set(rows.map((row) => row.action)).size;
    const entities = new Set(rows.map((row) => row.entityType || "none")).size;
    return { events: rows.length, actors, actions, entities };
  }, [rows]);

  return (
    <AdminShell title="Audit log" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!ready ? (
        <p className="mail-loading">{sessionError ? "" : "Loading audit log…"}</p>
      ) : (
        <div className="audit-page">
          <header className="audit-hero">
            <span className="audit-hero-icon" aria-hidden>
              <span className="audit-ring" />
              <ShieldIcon />
            </span>
            <div>
              <p>System</p>
              <h1>Audit log</h1>
              <p>Staff actions stay on record. Secrets and codes are never stored here.</p>
            </div>
          </header>

          <div className="audit-stats">
            <article className="is-brand">
              <span className="audit-stat-icon" aria-hidden><ListIcon /></span>
              <div>
                <span>Events</span>
                <strong>{stats.events}</strong>
                <em>Latest 50 in view</em>
              </div>
            </article>
            <article className="is-success">
              <span className="audit-stat-icon" aria-hidden><UserIcon /></span>
              <div>
                <span>Actors</span>
                <strong>{stats.actors}</strong>
                <em>People in this view</em>
              </div>
            </article>
            <article className="is-amber">
              <span className="audit-stat-icon" aria-hidden><BoltIcon /></span>
              <div>
                <span>Actions</span>
                <strong>{stats.actions}</strong>
                <em>Distinct action names</em>
              </div>
            </article>
            <article>
              <span className="audit-stat-icon" aria-hidden><BoxIcon /></span>
              <div>
                <span>Entities</span>
                <strong>{stats.entities}</strong>
                <em>Record types touched</em>
              </div>
            </article>
          </div>

          <section className="audit-card">
            <header className="audit-card-head">
              <span className="audit-stat-icon" aria-hidden><SearchIcon /></span>
              <div>
                <h2>Filters</h2>
                <p>Narrow the log by action name or the kind of record that changed.</p>
              </div>
            </header>
            <div className="audit-filters">
              <label>
                <span>Action</span>
                <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="mail.template_updated" />
              </label>
              <label>
                <span>Entity type</span>
                <input value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="email_template" />
              </label>
            </div>
          </section>

          {rows.length === 0 ? (
            <section className="audit-card audit-empty">
              <span className="audit-hero-icon" aria-hidden>
                <span className="audit-ring" />
                <ShieldIcon />
              </span>
              <h2>No audit events</h2>
              <p>Nothing matches these filters yet.</p>
            </section>
          ) : (
            <div className="audit-list">
              {rows.map((row, index) => (
                <Link
                  key={row.id}
                  href={`/admin/audit/${row.id}`}
                  className={`audit-event ${tone(row.action)}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <span className="audit-mark" aria-hidden>
                    <span className="audit-ring" />
                    <ShieldIcon />
                  </span>
                  <div>
                    <strong>{row.action}</strong>
                    <p>
                      {row.actorEmail || row.actorUserId || "system"}
                      {" · "}
                      {row.entityType || "record"}/{row.entityId || "—"}
                    </p>
                  </div>
                  <time dateTime={row.createdAt}>{formatBangladeshDateTime(row.createdAt)}</time>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v6c0 4.2 2.8 7.2 7 8.5 4.2-1.3 7-4.3 7-8.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7h11M8 12h11M8 17h11" />
      <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
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

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 3 6 13h6l-1 8 7-10h-6l1-8Z" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8 12 4l8 4-8 4-8-4Z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
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
