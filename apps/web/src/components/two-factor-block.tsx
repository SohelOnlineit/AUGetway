"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

type Setup = { secret: string; otpauthUrl: string };

/** The setup key is easier to type into an app when it is shown in groups of four. */
function grouped(secret: string) {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Turn the authenticator-app code on or off for the signed-in account. The server checks the password again,
 * so a stolen sign-in token alone cannot change this.
 */
export function TwoFactorBlock({ enabled, onChange }: { enabled: boolean; onChange: (on: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not finish");
    } finally {
      setBusy(false);
    }
  }

  function start(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await api<Setup>("/auth/2fa/setup", { method: "POST", body: JSON.stringify({ currentPassword: password }) });
      setSetup(result);
      setPassword("");
      setCode("");
    });
  }

  function turnOn(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
      setSetup(null);
      setCode("");
      onChange(true);
      setNote("Two-factor sign-in is on. The next sign-in on the website and on the phone app asks for the code.");
    });
  }

  function turnOff(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ currentPassword: password, code }) });
      setPassword("");
      setCode("");
      onChange(false);
      setNote("Two-factor sign-in is off.");
    });
  }

  return (
    <section className="account-block">
      <header>
        <span className="account-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 5 6v5c0 4.5 2.8 8.3 7 10 4.2-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
        </span>
        <div>
          <h3>Two-factor sign-in {enabled ? "· On" : "· Off"}</h3>
          <p>
            {enabled
              ? "Signing in needs the password and a 6-digit code from your authenticator app, so a stolen password alone is not enough."
              : "Add a 6-digit code from an authenticator app (Google Authenticator, Authy, Microsoft Authenticator) to the password. Strongly recommended for the main admin."}
          </p>
        </div>
      </header>

      {!enabled && !setup ? (
        <form onSubmit={start}>
          <div className="account-grid">
            <label className="account-field">
              <span className="account-label">Current password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="current-password" />
            </label>
          </div>
          <div className="account-save" style={{ marginTop: 16, padding: 0, background: "transparent", border: 0 }}>
            {error ? <p className="error">{error}</p> : null}
            {note ? <p className="account-note">{note}</p> : null}
            <button className="btn" type="submit" disabled={busy}>{busy ? "Please wait" : "Set up"}</button>
          </div>
        </form>
      ) : null}

      {!enabled && setup ? (
        <form onSubmit={turnOn}>
          <p className="account-hint">
            1. In your authenticator app choose <strong>Add account</strong>, then <strong>Enter a setup key</strong>.
            {" "}Type this key (account: your email, type: time based):
          </p>
          <div className="account-grid" style={{ marginTop: 12 }}>
            <label className="account-field">
              <span className="account-label">Setup key</span>
              <input readOnly value={grouped(setup.secret)} onFocus={(event) => event.currentTarget.select()} style={{ fontFamily: "monospace", letterSpacing: "0.08em" }} />
            </label>
            <label className="account-field">
              <span className="account-label">2. Code shown in the app</span>
              <input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" autoComplete="one-time-code" />
            </label>
          </div>
          <p className="account-hint" style={{ marginTop: 10 }}>
            On a phone you can also <a href={setup.otpauthUrl}>open the setup link</a> in the app. Keep the key private. It is shown only now.
          </p>
          <div className="account-save" style={{ marginTop: 12, padding: 0, background: "transparent", border: 0 }}>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn btn-quiet" type="button" onClick={() => { setSetup(null); setError(""); }}>Cancel</button>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Checking" : "Turn on"}</button>
          </div>
        </form>
      ) : null}

      {enabled ? (
        <form onSubmit={turnOff}>
          <div className="account-grid">
            <label className="account-field">
              <span className="account-label">Current password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="current-password" />
            </label>
            <label className="account-field">
              <span className="account-label">Code shown in the app</span>
              <input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" autoComplete="one-time-code" />
            </label>
          </div>
          <div className="account-save" style={{ marginTop: 16, padding: 0, background: "transparent", border: 0 }}>
            {error ? <p className="error">{error}</p> : null}
            {note ? <p className="account-note">{note}</p> : null}
            <button className="btn" type="submit" disabled={busy}>{busy ? "Please wait" : "Turn off"}</button>
          </div>
        </form>
      ) : null}
      {!enabled && !setup && note ? <p className="account-note" style={{ marginTop: 12 }}>{note}</p> : null}
    </section>
  );
}
