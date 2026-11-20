"use client";

import { formatBangladeshDateTime } from "@/lib/datetime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { PublicTicketDetail, PublicTicketListItem } from "@amarpin/types";
import { AccountShell, AccountState } from "@/components/account/AccountShell";

export default function TicketsPage() {
  const router = useRouter();
  const subjectId = useId();
  const bodyId = useId();
  const [rows, setRows] = useState<PublicTicketListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/tickets");
      if (cancelled) return;
      if (response.status === 401) {
        router.replace("/login?next=/tickets");
        return;
      }
      if (!response.ok) {
        setError("Unable to load tickets");
        setLoading(false);
        return;
      }
      setRows((await response.json()) as PublicTicketListItem[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function createTicket(event: FormEvent) {
    event.preventDefault();
    if (subject.trim().length < 4 || body.trim().length < 8) {
      setFormError("Subject (4+) and body (8+) are required");
      return;
    }
    setPending(true);
    setFormError(null);
    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: subject.trim(),
        body: body.trim(),
        idempotencyKey: `web-ticket-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
      id?: string;
    };
    setPending(false);
    if (!response.ok) {
      const message = Array.isArray(payload.message)
        ? payload.message.join(", ")
        : payload.message || "Could not create ticket";
      setFormError(message);
      return;
    }
    const created = payload as PublicTicketDetail;
    router.push(`/tickets/${created.id}`);
  }

  return (
    <AccountShell
      title="Support tickets"
      lead="Create and track support requests. Live chat opens from each ticket."
    >
      <AccountState loading={loading} error={error}>
        <div className="order-list">
          {rows.length === 0 ? (
            <p className="empty-state">No tickets yet.</p>
          ) : null}
          {rows.map((row) => (
            <Link key={row.id} href={`/tickets/${row.id}`} className="order-row">
              <div>
                <strong>{row.ticketNumber}</strong>
                <p>
                  {row.status} · {row.subject}
                </p>
              </div>
              <span>{formatBangladeshDateTime(row.updatedAt)}</span>
            </Link>
          ))}
        </div>
      </AccountState>

      <form className="account-stack" onSubmit={(e) => void createTicket(e)}>
        <h2>New ticket</h2>
        {formError ? <p className="form-error">{formError}</p> : null}
        <label htmlFor={subjectId}>
          Subject
          <input
            id={subjectId}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            minLength={4}
            maxLength={200}
            required
          />
        </label>
        <label htmlFor={bodyId}>
          Message
          <textarea
            id={bodyId}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            minLength={8}
            maxLength={4000}
            required
          />
        </label>
        <button type="submit" className="primary-btn" disabled={pending}>
          {pending ? "Creating…" : "Create ticket"}
        </button>
      </form>
    </AccountShell>
  );
}
