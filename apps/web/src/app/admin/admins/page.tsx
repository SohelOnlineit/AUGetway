"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Admin = { id: string; name: string; email: string; createdAt: string };

export default function AdminsPage() {
  const [rows, setRows] = useState<Admin[]>([]);
  const [role, setRole] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    api<Admin[]>("/desk/admins")
      .then((list) => {
        setRows(list);
        setRole("owner");
        setReady(true);
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : "Could not load";
        if (message.toLowerCase().includes("main admin")) setRole("admin");
        setError(message);
        setReady(true);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNote("");
    try {
      await api("/desk/admins", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      setCreating(false);
      setNote("Admin account opened. They can sign in with that email.");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the account");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/desk/admins/${id}`, { method: "DELETE" });
      setRows((current) => current.filter((row) => row.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="keys-page">
      <header className="keys-top">
        <div>
          <p className="keys-crumb">Desk <span>›</span> Admin accounts</p>
          <h2>Admin accounts</h2>
          <p className="muted">Open another sign-in for this desk. They see the same payments, gateways, and SMS.</p>
        </div>
        {role === "owner" ? (
          <button className="btn" type="button" onClick={() => { setCreating(true); setError(""); }}>Open account</button>
        ) : null}
      </header>
      {note ? <p className="muted">{note}</p> : null}
      {role === "admin" ? <p className="muted">Only the main admin can open or remove accounts.</p> : null}
      <section className="keys-card">
        <table className="keys-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          {rows.length > 0 ? (
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="name">{row.name}</td>
                  <td>{row.email}</td>
                  <td>
                    <button className="btn ghost" type="button" disabled={busy} onClick={() => void remove(row.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
        {ready && role === "owner" && rows.length === 0 ? (
          <div className="keys-empty">
            <div>
              <strong>No extra admin accounts</strong>
            </div>
          </div>
        ) : null}
      </section>
      {creating ? (
        <div className="modal-back" onClick={() => setCreating(false)}>
          <form className="modal dev-modal" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
            <h2>Open admin account</h2>
            <label>
              <span>Name</span>
              <input name="name" required minLength={2} maxLength={80} />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" required maxLength={120} autoComplete="off" />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" required minLength={8} maxLength={80} autoComplete="new-password" />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <div className="dev-modal-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? "Opening…" : "Open account"}</button>
              <button className="btn ghost" type="button" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
      {!creating && error && role !== "admin" ? <p className="error">{error}</p> : null}
    </div>
  );
}
