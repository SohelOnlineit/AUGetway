"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { TurnstileField } from "@/components/turnstile-field";

type TurnstileSettings = { siteKey: string; secretSet: boolean; enabled: boolean };

/**
 * Admin card for the Cloudflare check. Save the keys, pass the live test, then turn it on.
 * The test keeps a wrong key from locking everyone out of sign-in.
 */
export function TurnstilePanel() {
  const [saved, setSaved] = useState<TurnstileSettings | null>(null);
  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [token, setToken] = useState("");
  const [testReset, setTestReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const row = await api<TurnstileSettings>("/desk/security/turnstile");
    setSaved(row);
    setSiteKey(row.siteKey);
    setSecretKey("");
  }, []);

  useEffect(() => {
    load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load Turnstile"));
  }, [load]);

  async function send(body: Record<string, unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const row = await api<TurnstileSettings>("/desk/security/turnstile", { method: "PUT", body: JSON.stringify(body) });
      setSaved(row);
      setSiteKey(row.siteKey);
      setSecretKey("");
      setNotice(done);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setToken("");
      setTestReset((value) => value + 1);
      setBusy(false);
    }
  }

  function save() {
    const body: Record<string, unknown> = { siteKey: siteKey.trim() };
    if (secretKey.trim()) body.secretKey = secretKey.trim();
    const changed = siteKey.trim() !== (saved?.siteKey ?? "") || Boolean(secretKey.trim());
    void send(body, changed && saved?.enabled ? "Keys saved. The check is off until the test passes again." : "Keys saved.");
  }

  const keysReady = Boolean(saved?.siteKey) && saved?.secretSet === true;
  const dirty = siteKey.trim() !== (saved?.siteKey ?? "") || Boolean(secretKey.trim());
  const on = saved?.enabled === true;

  return (
    <section className="card ts-panel">
      <div className="item">
        <div>
          <strong>Cloudflare Turnstile</strong>
          <p className="muted">
            Protects the desk sign-in and the public payment pages (payment link, bill, and transaction ID check) from bots.
            The AU-Getway phone app is not asked for it.
          </p>
        </div>
        <span className={on ? "pill paid" : "pill"}>{saved === null ? "…" : on ? "On" : "Off"}</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}

      <label className="field">
        <span>Site key</span>
        <input value={siteKey} onChange={(event) => setSiteKey(event.target.value)} placeholder="Paste the site key from Cloudflare" autoComplete="off" maxLength={200} disabled={busy} />
      </label>
      <label className="field">
        <span>Secret key</span>
        <input
          type="password"
          value={secretKey}
          onChange={(event) => setSecretKey(event.target.value)}
          placeholder={saved?.secretSet ? "Leave blank to keep the saved secret" : "Paste the secret key"}
          autoComplete="new-password"
          maxLength={200}
          disabled={busy}
        />
      </label>
      <div className="row">
        <button className="btn" type="button" disabled={busy || !dirty} onClick={save}>
          {busy ? "Saving…" : "Save keys"}
        </button>
      </div>

      {on ? (
        <div className="row">
          <button className="btn-line" type="button" disabled={busy} onClick={() => void send({ enabled: false }, "Turnstile is off. The keys stay saved.")}>
            Turn off
          </button>
        </div>
      ) : keysReady && !dirty ? (
        <div className="ts-test">
          <p className="muted">Solve this check once. If it passes, the keys work and you can turn Turnstile on.</p>
          <TurnstileField siteKey={saved?.siteKey} resetKey={testReset} onToken={setToken} />
          <div className="row">
            <button className="btn" type="button" disabled={busy || !token} onClick={() => void send({ enabled: true, turnstileToken: token }, "Test passed. Turnstile is on.")}>
              Test and turn on
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">{dirty ? "Save the keys to run the test." : "Save both keys to run the test and turn it on."}</p>
      )}
    </section>
  );
}
