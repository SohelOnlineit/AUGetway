"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Handset = { id: string; label: string; model: string | null; battery: number | null; lastSeenAt: string | null };

export default function HandsetsPage() {
  const [rows, setRows] = useState<Handset[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Handset[]>("/desk/handsets")
      .then(setRows)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, []);

  return (
    <div className="stack">
      <div>
        <p className="kicker">Android</p>
        <h2>Handsets</h2>
        <p className="muted">Install the AU-Getway app, sign in with this desk, and submit a payment message you received on that phone.</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="list">
        {rows.map((row) => (
          <article className="card item" key={row.id}>
            <div>
              <strong>{row.label}</strong>
              <p className="muted">{row.model || "Android"} · battery {row.battery ?? "—"}%</p>
            </div>
            <span className="tiny">{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : "never"}</span>
          </article>
        ))}
        {rows.length === 0 ? <p className="muted">No handset has checked in yet.</p> : null}
      </div>
    </div>
  );
}
