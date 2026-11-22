"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Customer = { id: string; name: string; email: string | null; phone: string | null };
type Admin = { id: string; name: string; email: string };
type Tab = "customers" | "admins";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [canOpen, setCanOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("customers");
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState<Customer | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<Customer[]>("/desk/customers")
      .then((list) => {
        setRows(list);
        setReady(true);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
    api<Admin[]>("/desk/admins")
      .then((list) => {
        setAdmins(list);
        setCanOpen(true);
      })
      .catch(() => setCanOpen(false));
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "admins") setTab("admins");
    load();
  }, []);

  function show(next: Tab) {
    const view = next === "admins" && canOpen ? "admins" : "customers";
    setTab(view);
    setQuery("");
    setError("");
    const url = view === "admins" ? "/admin/customers?tab=admins" : "/admin/customers";
    window.history.replaceState(null, "", url);
  }

  const view: Tab = canOpen && tab === "admins" ? "admins" : "customers";
  const adminEmails = new Set(admins.map((row) => row.email.toLowerCase()));
  const needle = query.trim().toLowerCase();
  const customers = useMemo(() => {
    if (!needle) return rows;
    return rows.filter((row) => [row.name, row.email ?? "", row.phone ?? ""].some((value) => value.toLowerCase().includes(needle)));
  }, [rows, needle]);
  const deskAdmins = useMemo(() => {
    if (!needle) return admins;
    return admins.filter((row) => [row.name, row.email].some((value) => value.toLowerCase().includes(needle)));
  }, [admins, needle]);

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
      setNote("Customer saved.");
      show("customers");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function removeAdmin(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/desk/admins/${id}`, { method: "DELETE" });
      setAdmins((current) => current.filter((row) => row.id !== id));
      setNote("Admin account removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the account");
    } finally {
      setBusy(false);
    }
  }

  async function openAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!opening) return;
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
      setOpening(null);
      setNote("Admin account opened. They can sign in with that email.");
      setTab("admins");
      window.history.replaceState(null, "", "/admin/customers?tab=admins");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the account");
    } finally {
      setBusy(false);
    }
  }

  const shown = view === "customers" ? customers.length : deskAdmins.length;
  return (
    <div className="people-page">
      <header className="people-hero">
        <div>
          <p className="keys-crumb">Desk <span>›</span> Customers</p>
          <h2>Customers</h2>
          <p className="muted">People who pay through this desk, and the admins who sign in to it.</p>
        </div>
        <div className="people-actions">
          {canOpen ? <button className="people-ghost" type="button" onClick={() => { setOpening("new"); setError(""); }}>Open admin</button> : null}
          <button className="people-new" type="button" onClick={() => { setCreating(true); setError(""); }}>New customer</button>
        </div>
      </header>
      {note ? <p className="people-note">{note}</p> : null}
      {!creating && !opening && error ? <p className="error">{error}</p> : null}

      <div className="people-stats">
        <button type="button" className={view === "customers" ? "people-stat on" : "people-stat"} onClick={() => show("customers")}>
          <span className="people-stat-ico" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.5 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19c.4-2.4 2.2-4 4.5-4s4.1 1.6 4.5 4M16 15.2c1.7.3 3.1 1.4 3.6 3.3" /></svg>
          </span>
          <span>
            <strong>{ready ? rows.length : "—"}</strong>
            <small>Customers</small>
          </span>
        </button>
        {canOpen ? (
          <button type="button" className={view === "admins" ? "people-stat on" : "people-stat"} onClick={() => show("admins")}>
            <span className="people-stat-ico admin" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3 5 6v5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
            </span>
            <span>
              <strong>{admins.length}</strong>
              <small>Admins</small>
            </span>
          </button>
        ) : null}
      </div>

      <section className="people-board">
        <div className="people-bar">
          {canOpen ? (
            <div className={`people-switch${view === "admins" ? " admins" : ""}`} role="tablist" aria-label="Account list">
              <i />
              <button type="button" role="tab" aria-selected={view === "customers"} onClick={() => show("customers")}>Customers</button>
              <button type="button" role="tab" aria-selected={view === "admins"} onClick={() => show("admins")}>Admins</button>
            </div>
          ) : <span className="people-switch-label">Directory</span>}
          <label className="keys-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input value={query} placeholder={view === "admins" ? "Search admins" : "Search name, email, or phone"} aria-label="Search" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <span className="people-count">{shown} shown</span>
        </div>

        {view === "customers" ? (
          <div className="people-list" key="customers">
            {customers.map((row, index) => {
              const opened = Boolean(row.email && adminEmails.has(row.email.toLowerCase()));
              return (
                <article className="people-row" key={row.id} style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
                  <span className="people-avatar" aria-hidden="true">{initials(row.name)}</span>
                  <div className="people-id">
                    <strong>{row.name}</strong>
                    <p>
                      <span>{row.email || "No email"}</span>
                      {row.phone ? <span>{row.phone}</span> : null}
                    </p>
                  </div>
                  {canOpen ? (
                    opened ? <span className="people-chip">Admin open</span> : (
                      <button className="people-open" type="button" onClick={() => { setOpening(row); setError(""); }}>Open admin</button>
                    )
                  ) : <span className="people-chip quiet">Customer</span>}
                </article>
              );
            })}
            {ready && customers.length === 0 ? (
              <div className="people-empty">
                <span className="people-empty-mark" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.5 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19c.4-2.4 2.2-4 4.5-4s4.1 1.6 4.5 4" /></svg>
                </span>
                <strong>{needle ? "No matches" : "No customers yet"}</strong>
                <p>{needle ? "Nothing in this list matches that search." : "Add the first customer with the button above."}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="people-list" key="admins">
            {deskAdmins.map((row, index) => (
              <article className="people-row admin" key={row.id} style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
                <span className="people-avatar admin" aria-hidden="true">{initials(row.name)}</span>
                <div className="people-id">
                  <strong>{row.name}</strong>
                  <p><span>{row.email}</span></p>
                </div>
                <button className="people-remove" type="button" disabled={busy} onClick={() => void removeAdmin(row.id)}>Remove</button>
              </article>
            ))}
            {deskAdmins.length === 0 ? (
              <div className="people-empty">
                <span className="people-empty-mark" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM5.5 19.2c.5-2.6 2.8-4.2 6.5-4.2s6 1.6 6.5 4.2" /></svg>
                </span>
                <strong>{needle ? "No matches" : "No admin accounts yet"}</strong>
                <p>{needle ? "Nothing in this list matches that search." : "An admin signs in to this same desk and sees the same payments."}</p>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {creating ? (
        <div className="modal-back people-shade" onClick={() => setCreating(false)}>
          <form className="modal dev-modal people-dialog" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
            <div className="dev-modal-head">
              <div>
                <p className="keys-crumb">Customers</p>
                <h2>New customer</h2>
              </div>
            </div>
            <div className="dev-modal-body">
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
            </div>
            <div className="dev-modal-actions">
              <button className="btn ghost" type="button" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>Create</button>
            </div>
          </form>
        </div>
      ) : null}
      {opening ? (
        <div className="modal-back people-shade" onClick={() => setOpening(null)}>
          <form className="modal dev-modal people-dialog" onClick={(event) => event.stopPropagation()} onSubmit={openAdmin}>
            <div className="dev-modal-head">
              <div>
                <p className="keys-crumb">Desk admin</p>
                <h2>Open admin account</h2>
              </div>
            </div>
            <div className="dev-modal-body">
              <p className="muted">They sign in to this same desk and see the same payments.</p>
              <label>
                <span>Name</span>
                <input name="name" required minLength={2} maxLength={80} defaultValue={opening === "new" ? "" : opening.name} />
              </label>
              <label>
                <span>Email</span>
                <input name="email" type="email" required maxLength={120} defaultValue={opening === "new" ? "" : opening.email ?? ""} autoComplete="off" />
              </label>
              <label>
                <span>Password</span>
                <input name="password" type="password" required minLength={10} maxLength={80} autoComplete="new-password" />
              </label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn ghost" type="button" onClick={() => setOpening(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Opening…" : "Open account"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
