"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Account = { name: string; email: string; role: string };

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export default function AccountPage() {
  const [user, setUser] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Account>("/auth/me")
      .then((row) => {
        setUser(row);
        setName(row.name);
        setEmail(row.email);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load the account"));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !user) return;
    const nextName = name.trim();
    const next = email.trim().toLowerCase();
    if (nextName.length < 2) {
      setError("Name must be at least 2 characters");
      setNote("");
      return;
    }
    if (!next.includes("@") || !next.includes(".")) {
      setError("Enter a valid email");
      setNote("");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      setNote("");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      setNote("");
      return;
    }
    if (nextName === user.name && next === user.email && !newPassword) {
      setError("Change the name, email, or password");
      setNote("");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    try {
      const result = await api<{ accessToken: string; user: Account }>("/auth/account", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, email: next, name: nextName, ...(newPassword ? { newPassword } : {}) }),
      });
      sessionStorage.setItem("uniqpay_token", result.accessToken);
      setUser(result.user);
      setName(result.user.name);
      setEmail(result.user.email);
      window.dispatchEvent(new CustomEvent("uniqpay-account", { detail: result.user }));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      const changed = [
        nextName !== user.name ? "Name" : "",
        next !== user.email ? "Email" : "",
        newPassword ? "Password" : "",
      ].filter(Boolean);
      setNote(`${changed.join(", ")} updated`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the account");
    } finally {
      setBusy(false);
    }
  }

  const role = user?.role === "owner" ? "Main admin" : "Admin";

  return (
    <div className="account-page">
      <header className="account-top">
        <div>
          <p className="keys-crumb">Desk <span>›</span> Account</p>
          <h2>Your account</h2>
          <p className="muted">Change the name shown on this desk, the sign-in email, or the password. The current password confirms the change.</p>
        </div>
      </header>

      <section className="account-hero">
        <div className="account-mark" aria-hidden="true">{user ? initials(user.name, user.email) : "·"}</div>
        <div>
          <h3>{user?.name || "Desk"}</h3>
          <p>{user?.email || "Loading the signed-in account"}</p>
        </div>
        <span className="account-role">{user ? role : "…"}</span>
      </section>

      <form className="account-form" onSubmit={(event) => void save(event)}>
        <article className="account-card account-name">
          <header>
            <span className="account-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.2c.5-2.6 2.8-4.2 6.5-4.2s6 1.6 6.5 4.2" /></svg>
            </span>
            <div>
              <h3>Display name</h3>
              <p>This is the name on the account menu. It is not the public brand name.</p>
            </div>
          </header>
          <label className="account-field">
            <span className="account-label">Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
          </label>
        </article>
        <article className="account-card">
          <header>
            <span className="account-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7.5h16v10H4z" /><path d="m4 8 8 6 8-6" /></svg>
            </span>
            <div>
              <h3>Login email</h3>
              <p>This is the address used at the desk sign-in.</p>
            </div>
          </header>
          <label className="account-field">
            <span className="account-label">Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={120} autoComplete="username" placeholder="name@pay.uniqbd.com" />
          </label>
        </article>

        <article className="account-card">
          <header>
            <span className="account-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            </span>
            <div>
              <h3>Password</h3>
              <p>Leave the new password blank to keep the current one.</p>
            </div>
          </header>
          <label className="account-field">
            <span className="account-label">Current password</span>
            <span className="account-secret">
              <input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required minLength={8} autoComplete="current-password" />
              <button type="button" onClick={() => setShowCurrent((open) => !open)}>{showCurrent ? "Hide" : "Show"}</button>
            </span>
          </label>
          <label className="account-field">
            <span className="account-label">New password</span>
            <span className="account-secret">
              <input type={showNew ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={80} autoComplete="new-password" placeholder="At least 8 characters" />
              <button type="button" onClick={() => setShowNew((open) => !open)}>{showNew ? "Hide" : "Show"}</button>
            </span>
          </label>
          <label className="account-field">
            <span className="account-label">Confirm new password</span>
            <input type={showNew ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Repeat the new password" />
          </label>
        </article>

        <div className="account-save">
          {error ? <p className="error">{error}</p> : null}
          {note ? <p className="account-note">{note}</p> : null}
          <button className="btn" type="submit" disabled={busy || !user}>{busy ? "Saving" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}
