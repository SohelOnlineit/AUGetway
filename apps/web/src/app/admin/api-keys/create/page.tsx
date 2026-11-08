"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type KeyType = "payment" | "sms";
type Generation = "auto" | "custom";

const paymentAbilities = ["payment:checkout", "payment:verify", "payment:refund"] as const;
const smsAbilities = ["sms:sync", "sms:receive", "sms:send"] as const;
const abilityCopy: Record<string, string> = {
  "payment:checkout": "payment:checkout (Create Payment Sessions)",
  "payment:verify": "payment:verify (Verify Transactions)",
  "payment:refund": "payment:refund (Process Refunds)",
  "sms:sync": "sms:sync (Sync SMS from Mobile App)",
  "sms:receive": "sms:receive (Receive Incoming SMS)",
  "sms:send": "sms:send (Send Outgoing SMS via Gateway)",
};

const blank = {
  keyType: "payment" as KeyType,
  name: "",
  generation: "auto" as Generation,
  token: "",
  abilities: [...paymentAbilities] as string[],
  webhookUrl: "",
  expiresAt: "",
  active: true,
};

export default function CreateKeyPage() {
  const router = useRouter();
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState("");
  const [notice, setNotice] = useState("");

  function setType(keyType: KeyType) {
    setForm((current) => ({
      ...current,
      keyType,
      abilities: keyType === "sms" ? [...smsAbilities] : [...paymentAbilities],
    }));
  }

  function toggleAbility(ability: string) {
    setForm((current) => ({
      ...current,
      abilities: current.abilities.includes(ability)
        ? current.abilities.filter((item) => item !== ability)
        : [...current.abilities, ability],
    }));
  }

  async function submit(another: boolean) {
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: string; token: string }>("/desk/keys", {
        method: "POST",
        body: JSON.stringify({
          label: form.name.trim(),
          keyType: form.keyType,
          generation: form.generation,
          token: form.generation === "custom" ? form.token.trim() : undefined,
          abilities: form.abilities,
          webhookUrl: form.webhookUrl.trim(),
          expiresAt: form.expiresAt || undefined,
          active: form.active,
        }),
      });
      if (another) {
        setNotice(created.token);
        setIssued("");
        setForm(blank);
      } else {
        sessionStorage.setItem("uniqpay_fresh_key", JSON.stringify({ id: created.id, token: created.token }));
        setIssued(created.token);
        setNotice("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const another = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-another") === "1";
    void submit(another);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Could not copy the key");
    }
  }

  const heading = (
    <header className="key-head">
      <p className="keys-crumb">
        <Link href="/admin/api-keys">Api Keys</Link>
        <span>›</span>
        Create
      </p>
      <h2>Create Api Key</h2>
    </header>
  );

  return (
    <div className="key-create">
      {issued ? (
        <section className="key-card">
          {heading}
          <div className="key-body">
            <h3>API Key created</h3>
            <p className="muted">Copy this key now. It is shown only once. Send it as <span className="token">x-merchant-key</span>.</p>
            <button className="key-reveal" type="button" onClick={() => copy(issued)}>{issued}</button>
            <div className="key-actions">
              <button className="btn" type="button" onClick={() => router.push("/admin/api-keys")}>Back to list</button>
            </div>
          </div>
        </section>
      ) : (
        <form onSubmit={onSubmit}>
          <section className="key-card">
            {heading}
            <div className="key-body">
            <h3>API Key Information</h3>
            <p className="sub">Generate an API Key for Payment Gateway integration or SMS Gateway mobile sync.</p>
            <label>
              <span>Key Type</span>
              <select value={form.keyType} onChange={(event) => setType(event.target.value as KeyType)}>
                <option value="payment">Payment Gateway (Merchant Checkout & Verification — uq_live_...)</option>
                <option value="sms">SMS Gateway (Handset message sync — uq_node_...)</option>
              </select>
            </label>
            <label>
              <span>Key Name <i>*</i></span>
              <input
                value={form.name}
                required
                minLength={2}
                maxLength={80}
                placeholder="e.g. Shop checkout or Handset sync"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              <span>Key Generation</span>
              <select value={form.generation} onChange={(event) => setForm({ ...form, generation: event.target.value as Generation })}>
                <option value="auto">Auto-generate Key (Recommended)</option>
                <option value="custom">Custom / Paste Existing API Key</option>
              </select>
            </label>
            {form.generation === "custom" ? (
              <label>
                <span>API Key / Public Key</span>
                <input
                  value={form.token}
                  required
                  minLength={12}
                  maxLength={120}
                  placeholder="Paste the key you want to keep"
                  onChange={(event) => setForm({ ...form, token: event.target.value })}
                />
                <p className="hint">At least 12 characters. This value is sent as x-merchant-key.</p>
              </label>
            ) : null}
            <fieldset>
              <legend>Abilities / Permissions</legend>
              <div className="key-checks">
                {[...paymentAbilities, ...smsAbilities].map((ability) => (
                  <label key={ability}>
                    <input type="checkbox" checked={form.abilities.includes(ability)} onChange={() => toggleAbility(ability)} />
                    <span>{abilityCopy[ability]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>Webhook URL (Optional)</span>
              <input
                value={form.webhookUrl}
                placeholder="https://your-domain.com/api/payment-webhook"
                onChange={(event) => setForm({ ...form, webhookUrl: event.target.value })}
              />
            </label>
            <label>
              <span>Expires At (Optional)</span>
              <input type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
            </label>
            <div className="key-active">
              <button className={`switch ${form.active ? "on" : ""}`} type="button" aria-label={form.active ? "Turn off" : "Turn on"} onClick={() => setForm({ ...form, active: !form.active })}>
                <span />
              </button>
              Is Active
            </div>
            {notice ? (
              <p className="key-note">
                Previous key, copy it now: <button type="button" onClick={() => copy(notice)}>{notice}</button>
              </p>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="key-actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
              <button className="btn-line" type="submit" data-another="1" disabled={busy}>Create & create another</button>
              <Link className="btn-line" href="/admin/api-keys">Cancel</Link>
            </div>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
