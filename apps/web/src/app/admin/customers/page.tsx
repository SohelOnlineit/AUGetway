"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Customer = { id: string; name: string; email: string | null; phone: string | null };
type Col = "name" | "email" | "phone";

const columns: { key: Col; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email address" },
  { key: "phone", label: "Phone" },
];

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<Record<Col, boolean>>({ name: true, email: true, phone: true });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    api<Customer[]>("/desk/customers")
      .then((list) => {
        setRows(list);
        setReady(true);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }

  useEffect(() => {
    load();
  }, []);

  const visible = columns.filter((column) => shown[column.key]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [row.name, row.email ?? "", row.phone ?? ""].some((value) => value.toLowerCase().includes(needle)));
  }, [rows, query]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await api("/desk/customers", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        }),
      });
      setCreating(false);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="keys-page cust-page">
      <header className="keys-top">
        <div>
          <p className="keys-crumb">Customers <span>›</span> List</p>
          <h2>Customers</h2>
        </div>
        <button className="btn" type="button" onClick={() => { setCreating(true); setError(""); }}>New customer</button>
      </header>
      <section className="keys-card">
        <div className="keys-tools">
          <label className="keys-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input value={query} placeholder="Search" aria-label="Search" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="keys-cols-wrap">
            <button className="keys-cols" type="button" aria-label="Columns" onClick={() => setColumnsOpen((open) => !open)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="5" width="3.2" height="14" rx="1" />
                <rect x="10.4" y="5" width="3.2" height="14" rx="1" />
                <rect x="16.8" y="5" width="3.2" height="14" rx="1" />
              </svg>
            </button>
            {columnsOpen ? (
              <div className="keys-menu">
                {columns.map((column) => (
                  <label
                    key={column.key}
                    onClick={(event) => {
                      event.preventDefault();
                      setShown((current) => ({ ...current, [column.key]: !current[column.key] }));
                    }}
                  >
                    <input type="checkbox" checked={shown[column.key]} readOnly />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <table className="keys-table">
          <thead>
            <tr>
              {visible.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          {filtered.length > 0 ? (
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  {shown.name ? <td className="name">{row.name}</td> : null}
                  {shown.email ? <td>{row.email || "—"}</td> : null}
                  {shown.phone ? <td>{row.phone || "—"}</td> : null}
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
              <strong>No customers</strong>
            </div>
          </div>
        ) : null}
      </section>

      {creating ? (
        <div className="modal-back" onClick={() => setCreating(false)}>
          <form className="modal dev-modal" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
            <h2>New customer</h2>
            <label>
              <span>Name</span>
              <input name="name" required minLength={2} maxLength={80} />
            </label>
            <label>
              <span>Email address</span>
              <input name="email" type="email" maxLength={120} />
            </label>
            <label>
              <span>Phone</span>
              <input name="phone" maxLength={20} />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <div className="dev-modal-actions">
              <button className="btn" type="submit" disabled={busy}>Create</button>
              <button className="btn ghost" type="button" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
      {!creating && error ? <p className="error">{error}</p> : null}
    </div>
  );
}
