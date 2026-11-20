"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminAuditDetail } from "@amarpin/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

export default function AdminAuditDetailPage() {
  const params = useParams<{ id: string }>();
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [row, setRow] = useState<AdminAuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<AdminAuditDetail>(`/audit/${params.id}`);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRow(result.data);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, params.id, sessionError]);

  return (
    <AdminShell title="Audit event" permissions={permissions} bare>
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {!row ? (
        <p className="mail-loading">{sessionError || error ? "" : "Loading event…"}</p>
      ) : (
        <div className="audit-page">
          <p className="audit-back">
            <Link href="/admin/audit">← Audit log</Link>
          </p>
          <header className="audit-hero">
            <span className="audit-hero-icon" aria-hidden>
              <span className="audit-ring" />
              <ShieldIcon />
            </span>
            <div>
              <p>Audit event</p>
              <h1>{row.action}</h1>
              <p>{formatBangladeshDateTime(row.createdAt)}</p>
            </div>
          </header>
          <div className="audit-stats">
            <article className="is-brand">
              <span className="audit-stat-icon" aria-hidden><UserIcon /></span>
              <div>
                <span>Actor</span>
                <strong>{row.actorEmail || "System"}</strong>
                <em>{row.actorUserId || "No user id"}</em>
              </div>
            </article>
            <article className="is-amber">
              <span className="audit-stat-icon" aria-hidden><BoxIcon /></span>
              <div>
                <span>Entity</span>
                <strong>{row.entityType || "None"}</strong>
                <em>{row.entityId || "No record id"}</em>
              </div>
            </article>
            <article className="is-success">
              <span className="audit-stat-icon" aria-hidden><ClockIcon /></span>
              <div>
                <span>Recorded</span>
                <strong>{formatBangladeshDateTime(row.createdAt)}</strong>
                <em>Bangladesh time</em>
              </div>
            </article>
            <article>
              <span className="audit-stat-icon" aria-hidden><LockIcon /></span>
              <div>
                <span>IP hash</span>
                <strong>{row.ipHash ? "Stored" : "Not stored"}</strong>
                <em>{row.ipHash || "No address hash"}</em>
              </div>
            </article>
          </div>
          <section className="audit-card">
            <header className="audit-card-head">
              <span className="audit-stat-icon" aria-hidden><CodeIcon /></span>
              <div>
                <h2>Metadata</h2>
                <p>Extra details saved with this action. Passwords and codes are removed.</p>
              </div>
            </header>
            <pre className="audit-meta">{JSON.stringify(row.metadata, null, 2)}</pre>
          </section>
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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3" />
      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
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

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" />
    </svg>
  );
}
