"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { TurnstilePanel } from "@/components/turnstile-panel";

type SecurityEvent = {
  id: string;
  kind: string;
  sender: string;
  trxId: string;
  handsetId: string;
  noticeId: string;
  checkoutId: string;
  detail: string;
  authenticity: "not-checked";
  createdAt: string;
};

const KINDS = [
  ["suspicious_sender", "Suspicious Sender", "warn"],
  ["repeated_trx", "Repeated Transaction ID", "bad"],
  ["high_frequency", "High Frequency SMS", "warn"],
  ["unique_amount_without_ref", "Unique Amount Without Reference", "warn"],
  ["unmatched_sms", "Unmatched SMS", "quiet"],
  ["duplicate_submission", "Duplicate Submission", "info"],
] as const;

const PAGE_SIZE = 10;

function Stat({ label, value, ready, icon, on, onClick }: { label: string; value: number; ready: boolean; icon: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={on ? `sec-stat on ${icon}` : `sec-stat ${icon}`} onClick={onClick} aria-pressed={on}>
      <span className={`sec-ico ${icon}`} aria-hidden="true"><StatIcon name={icon} /></span>
      <span>
        {ready ? <strong>{value}</strong> : <span className="sec-skel card" />}
        <small>{label}</small>
      </span>
    </button>
  );
}

function StatIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "user") return <svg viewBox="0 0 24 24"><circle {...common} cx="12" cy="8" r="3" /><path {...common} d="M6 19c.6-2.4 2.6-4 6-4s5.4 1.6 6 4" /></svg>;
  if (name === "repeat") return <svg viewBox="0 0 24 24"><path {...common} d="M17 7h3V4M7 17H4v3" /><path {...common} d="M20 7a8 8 0 0 0-13.7-2.3L4 7M4 17a8 8 0 0 0 13.7 2.3L20 17" /></svg>;
  if (name === "mail") return <svg viewBox="0 0 24 24"><rect {...common} x="3" y="5" width="18" height="14" rx="2" /><path {...common} d="m4 7 8 6 8-6" /></svg>;
  return <svg viewBox="0 0 24 24"><path {...common} d="M12 3.5 19 6.2v5.3c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2z" /><path {...common} d="m9 12 2 2 4-4" /></svg>;
}

function kindMeta(kind: string) {
  return KINDS.find((row) => row[0] === kind) ?? (["", kind || "Unknown", "quiet"] as const);
}

function dayStart(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
}

function cell(value: string) {
  const text = value.trim();
  if (!text) return <span className="muted">—</span>;
  return <span className="sec-id" title={text}>{text}</span>;
}

export default function SecurityMonitoringPage() {
  const [rows, setRows] = useState<SecurityEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  const [sender, setSender] = useState("");
  const [trx, setTrx] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback((manual = false) => {
    if (manual) setRefreshing(true);
    api<SecurityEvent[]>("/desk/security-events")
      .then((list) => {
        setRows(Array.isArray(list) ? list : []);
        setError("");
        setReady(true);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Could not load security events");
        setReady(true);
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [kind, sender, trx, from, to]);

  const filtered = useMemo(() => {
    const senderNeedle = sender.trim().toLowerCase();
    const trxNeedle = trx.trim().toLowerCase();
    const fromMs = from ? dayStart(from) : null;
    const toStart = to ? dayStart(to) : null;
    const toMs = toStart === null ? null : toStart + 24 * 60 * 60 * 1000;
    return rows.filter((row) => {
      if (kind && row.kind !== kind) return false;
      if (senderNeedle && !row.sender.toLowerCase().includes(senderNeedle)) return false;
      if (trxNeedle && !row.trxId.toLowerCase().includes(trxNeedle)) return false;
      const when = new Date(row.createdAt).getTime();
      if (fromMs !== null && when < fromMs) return false;
      if (toMs !== null && when >= toMs) return false;
      return true;
    });
  }, [rows, kind, sender, trx, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const counts = {
    total: rows.length,
    suspicious: rows.filter((row) => row.kind === "suspicious_sender").length,
    repeated: rows.filter((row) => row.kind === "repeated_trx").length,
    unmatched: rows.filter((row) => row.kind === "unmatched_sms").length,
  };

  return (
    <div className="sec-page">
      <header className="sec-hero">
        <span className="sec-hero-ico" aria-hidden="true">
          <svg className="sec-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
            <path d="M12 3.5 19 6.2v5.3c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <i />
        </span>
        <div>
          <p className="keys-crumb">Desk <span>›</span> Security Monitoring</p>
          <h2>Security Monitoring</h2>
          <p className="muted sec-note">Passive logs from this desk. A log does not prove or disprove who sent the SMS. The desk returns the latest 100 events.</p>
        </div>
      </header>

      <TurnstilePanel />

      <section className="sec-cards" aria-label="Security summary">
        <Stat label="Total events" value={counts.total} ready={ready} icon="shield" on={kind === ""} onClick={() => setKind("")} />
        <Stat label="Suspicious senders" value={counts.suspicious} ready={ready} icon="user" on={kind === "suspicious_sender"} onClick={() => setKind("suspicious_sender")} />
        <Stat label="Repeated transactions" value={counts.repeated} ready={ready} icon="repeat" on={kind === "repeated_trx"} onClick={() => setKind("repeated_trx")} />
        <Stat label="Unmatched SMS" value={counts.unmatched} ready={ready} icon="mail" on={kind === "unmatched_sms"} onClick={() => setKind("unmatched_sms")} />
      </section>

      {error ? (
        <section className="keys-card">
          <div className="keys-empty">
            <div>
              <span className="mark">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 8v5M12 16.5h.01" /><circle cx="12" cy="12" r="8" /></svg>
              </span>
              <strong>Could not load security events</strong>
              <p className="error sec-error">{error}</p>
              <button className="btn sec-refresh" type="button" onClick={() => load(true)}>Try again</button>
            </div>
          </div>
        </section>
      ) : (
        <section className="keys-card">
          <div className="sec-filters">
            <label>
              Event type
              <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Event type">
                <option value="">All events</option>
                {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Sender
              <input value={sender} placeholder="Search sender" aria-label="Sender search" onChange={(event) => setSender(event.target.value)} />
            </label>
            <label>
              Transaction ID
              <input value={trx} placeholder="Search TrxID" aria-label="Transaction ID search" onChange={(event) => setTrx(event.target.value)} />
            </label>
            <label>
              From
              <input type="date" value={from} aria-label="From date" onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} aria-label="To date" onChange={(event) => setTo(event.target.value)} />
            </label>
            <button className="btn sec-refresh" type="button" disabled={refreshing} onClick={() => load(true)}>
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
          <div className="txn-scroll">
            <table className="keys-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Sender</th>
                  <th>Transaction ID</th>
                  <th>Handset ID</th>
                  <th>Notice ID</th>
                  <th>Checkout ID</th>
                  <th>Details</th>
                  <th>Date & Time</th>
                </tr>
              </thead>
              {ready && visible.length > 0 ? (
                <tbody>
                  {visible.map((row) => {
                    const [, label, tone] = kindMeta(row.kind);
                    return (
                      <tr key={row.id}>
                        <td><span className={`sec-kind ${tone}`}><i />{label}</span></td>
                        <td>{row.sender.trim() || "—"}</td>
                        <td>{cell(row.trxId)}</td>
                        <td>{cell(row.handsetId)}</td>
                        <td>{cell(row.noticeId)}</td>
                        <td>{cell(row.checkoutId)}</td>
                        <td className="sec-detail">{row.detail.trim() || "—"}</td>
                        <td className="muted">{new Date(row.createdAt).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ) : null}
              {!ready ? (
                <tbody>
                  {Array.from({ length: 5 }, (_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 8 }, (_, cellIndex) => (
                        <td key={cellIndex}><span className="sec-skel" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ) : null}
            </table>
          </div>
          {ready && filtered.length === 0 ? (
            <div className="keys-empty">
              <div>
                <span className="mark">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3.5 19 6.2v5.3c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2z" /></svg>
                </span>
                <strong>No security events</strong>
                <p className="muted">Nothing on this desk matches the current filters.</p>
              </div>
            </div>
          ) : null}
          {ready && filtered.length > 0 ? (
            <div className="sec-foot">
              <span>Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="gw-pages">
                <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button>
                <span>{current} / {pages}</span>
                <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
