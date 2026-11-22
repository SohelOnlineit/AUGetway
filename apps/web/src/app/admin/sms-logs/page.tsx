"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Log = { id: string; sender: string; body: string; handset: string; checkout: string | null; orderNumber?: string; createdAt: string };

function orderText(value: string | undefined) {
  return (value || "").replace(/^#/, "").trim();
}

function markKind(value: string) {
  const text = value.toLowerCase();
  if (text.includes("bkash") || text.includes("bikash")) return "bkash";
  if (text.includes("nagad")) return "nagad";
  if (text.includes("rocket")) return "rocket";
  if (text.includes("upay") || text.includes("upai")) return "upay";
  if (text.includes("qr")) return "banglaqr";
  return "bank";
}

function when(value: string) {
  const date = new Date(value);
  return {
    day: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

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
    return rows.filter((row) => {
      const orderNumber = orderText(row.orderNumber).toLowerCase();
      return [row.sender, row.body, row.handset, row.checkout, orderNumber, orderNumber ? `#${orderNumber}` : ""]
        .some((value) => (value || "").toLowerCase().includes(needle));
    });
  }, [rows, query]);

  const matched = rows.filter((row) => row.checkout).length;
  const handsets = new Set(rows.map((row) => row.handset).filter(Boolean)).size;

  return (
    <div className="ogw-page">
      {error ? <p className="error">{error}</p> : null}
      <header className="ogw-head">
        <div>
          <p className="ogw-kicker">SMS Gateway</p>
          <h2>Sms Logs</h2>
          <p>Payment SMS from the signed-in phone. This list refreshes every 10 seconds.</p>
        </div>
        <Link className="ogw-back" href="/admin/sms-gateway">Android nodes</Link>
      </header>
      <div className="ogw-stats">
        <article><b>{ready ? rows.length : "—"}</b><small>Messages</small></article>
        <article><b>{ready ? matched : "—"}</b><small>Matched</small></article>
        <article><b>{ready ? rows.length - matched : "—"}</b><small>Waiting</small></article>
        <article><b>{ready ? handsets : "—"}</b><small>{handsets === 1 ? "Handset" : "Handsets"}</small></article>
      </div>
      <section className="ogw-card">
        <div className="ogw-tools">
          <label className="ogw-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={query} placeholder="Order number, sender, message" aria-label="Search by order number" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="ogw-scroll">
          <table className="ogw-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Handset</th>
                <th>Sender</th>
                <th>Message</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const stamp = when(row.createdAt);
                const sender = row.sender || "Unknown";
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="ogw-name">
                        <div>
                          <strong>{stamp.day}</strong>
                          <em>{stamp.time}</em>
                        </div>
                      </div>
                    </td>
                    <td className="ogw-account">{row.handset || "—"}</td>
                    <td>
                      <div className="ogw-name">
                        <span className={`ogw-mark ogw-mark--${markKind(sender)}`} aria-hidden>{sender.slice(0, 1)}</span>
                        <strong>{sender}</strong>
                      </div>
                    </td>
                    <td className="sms-body">{row.body}</td>
                    <td>
                      {orderText(row.orderNumber) ? (
                        <div className="ogw-name">
                          <div>
                            <strong>#{orderText(row.orderNumber)}</strong>
                            <em>{row.checkout}</em>
                          </div>
                        </div>
                      ) : row.checkout ? <span className="ogw-pill ogw-pill--ok">{row.checkout}</span> : <span className="ogw-pill">Waiting</span>}
                    </td>
                  </tr>
                );
              })}
              {ready && filtered.length === 0 ? <tr><td colSpan={5}>No messages match.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="ogw-foot">
          <span>{ready ? `Showing ${filtered.length} of ${rows.length}` : "Loading messages"}</span>
        </div>
      </section>
    </div>
  );
}
