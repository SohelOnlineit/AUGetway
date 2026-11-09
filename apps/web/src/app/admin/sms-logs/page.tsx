"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Log = { id: string; sender: string; body: string; handset: string; checkout: string | null; createdAt: string };

export default function SmsLogsPage() {
  const [rows, setRows] = useState<Log[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let stop = false;
    const load = () => {
      api<Log[]>("/desk/sms-logs")
        .then((list) => {
          if (stop) return;
          setRows(list);
          setReady(true);
          setError("");
        })
        .catch((cause: unknown) => {
          if (!stop) setError(cause instanceof Error ? cause.message : "Could not load");
        });
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.sender, row.body, row.handset, row.checkout].some((value) => (value || "").toLowerCase().includes(needle)),
    );
  }, [rows, query]);

  return (
    <div className="keys-page sms-board">
      <p className="keys-crumb">SMS Gateway <span>›</span> Sms Logs</p>
      <header className="keys-top">
        <div>
          <h2>Sms Logs</h2>
          <p className="muted">Payment SMS the signed-in phone collects and sends to this desk.</p>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <section className="keys-card">
        <div className="keys-tools">
          <label className="keys-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input value={query} placeholder="Search" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <table className="keys-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Handset</th>
              <th>Sender</th>
              <th>Message</th>
              <th>Checkout</th>
            </tr>
          </thead>
          {filtered.length > 0 ? (
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="muted">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="name">{row.handset}</td>
                  <td>{row.sender || "—"}</td>
                  <td className="sms-body">{row.body}</td>
                  <td>{row.checkout || "—"}</td>
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
        {ready && filtered.length === 0 ? (
          <div className="keys-empty">
            <div>
              <span className="mark">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 8l8 8M16 8l-8 8" />
                </svg>
              </span>
              <strong>No messages</strong>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
