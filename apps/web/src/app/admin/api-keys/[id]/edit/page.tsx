"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type KeyType = "checkout" | "sms";

type KeyRow = {
  id: string;
  label: string;
  prefix: string;
  keyType: string;
  abilities: string[];
  webhookUrl: string;
  expiresAt: string | null;
  active: boolean;
};

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

function dateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function rememberedKey(id: string) {
  try {
    const raw = sessionStorage.getItem("uniqpay_seen_keys");
    const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
    if (typeof parsed[id] === "string") return parsed[id];
    const issued = sessionStorage.getItem("uniqpay_fresh_key");
    if (!issued) return "";
    const fresh = JSON.parse(issued) as { id?: string; token?: string };
    return fresh.id === id && fresh.token ? fresh.token : "";
  } catch {
    return "";
  }
}

function rememberKey(id: string, token: string) {
  const raw = sessionStorage.getItem("uniqpay_seen_keys");
  const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
  parsed[id] = token;
  sessionStorage.setItem("uniqpay_seen_keys", JSON.stringify(parsed));
}

export default function EditKeyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [known, setKnown] = useState("");
  const [form, setForm] = useState({
    keyType: "checkout" as KeyType,
    name: "",
    token: "",
    secret: "",
    abilities: [...paymentAbilities] as string[],
    webhookUrl: "",
    expiresAt: "",
    active: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState("");
  const [copied, setCopied] = useState(false);
  const [secretEdited, setSecretEdited] = useState(false);

  useEffect(() => {
    const saved = rememberedKey(id);
    api<KeyRow[]>("/desk/keys")
      .then((list) => {
        const row = list.find((item) => item.id === id);
        if (!row) {
          setMissing(true);
          return;
        }
        const keyType: KeyType = row.keyType === "sms" ? "sms" : "checkout";
        const abilities = Array.isArray(row.abilities) ? row.abilities.filter((item) => item in abilityCopy) : [];
        setKnown(saved);
        setForm({
          keyType,
          name: row.label,
          token: saved,
          secret: saved,
          abilities: abilities.length > 0 ? abilities : (keyType === "sms" ? [...smsAbilities] : [...paymentAbilities]),
          webhookUrl: row.webhookUrl,
          expiresAt: dateInput(row.expiresAt),
          active: row.active,
        });
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"))
      .finally(() => setReady(true));
  }, [id]);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = form.name.trim();
    if (name.length < 2) {
      setError("Key name must be at least 2 characters");
      return;
    }
    if (form.abilities.length === 0) {
      setError("Choose at least one ability");
      return;
    }
    const token = form.token.trim();
    const secret = form.secret.trim();
    const distinctSecret = secret && secret !== token && secret !== known ? secret : "";
    setBusy(true);
    setError("");
    try {
      const saved = await api<{ ok: true; token?: string }>(`/desk/keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: name,
          keyType: form.keyType,
          abilities: form.abilities,
          webhookUrl: form.webhookUrl.trim(),
          expiresAt: form.expiresAt,
          active: form.active,
          token: token || undefined,
          secret: secretEdited ? distinctSecret : undefined,
          generate: !token && Boolean(known),
        }),
      });
      if (saved.token) {
        rememberKey(id, saved.token);
        setKnown(saved.token);
        setForm((current) => ({ ...current, token: saved.token ?? current.token, secret: saved.token ?? current.secret }));
        setIssued(saved.token);
      } else {
        router.push("/admin/api-keys");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function copyIssued() {
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the key");
    }
  }

  return (
    <div className="key-create">
      <form onSubmit={onSubmit}>
        <section className="key-card">
          <header className="key-head">
            <p className="keys-crumb">
              <Link href="/admin/api-keys">Api Keys</Link>
              <span>›</span>
              {form.name || "Key"}
              <span>›</span>
              Edit
            </p>
            <h2>Edit {form.name || "API key"}</h2>
          </header>
          <div className="key-body">
            <h3>API Key Information</h3>
            <p className="sub">Generate an API Key for Payment Gateway integration or SMS Gateway mobile sync.</p>
            {!ready ? <p className="muted">Loading…</p> : null}
            {missing ? <p className="error">This API key was not found.</p> : null}
            {ready && !missing ? (
              <>
                <label>
                  <span>Key Type</span>
                  <select value={form.keyType} onChange={(event) => setType(event.target.value as KeyType)}>
                    <option value="checkout">Payment Gateway (Merchant Checkout & Verification — uq_live_...)</option>
                    <option value="sms">SMS Gateway (Mobile Sync & Android Gateway App — sg_live_...)</option>
                  </select>
                </label>
                <label>
                  <span>Key Name <i>*</i></span>
                  <input value={form.name} required minLength={2} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label>
                  <span>API Key / Public Key</span>
                  <input
                    value={form.token}
                    maxLength={120}
                    placeholder={form.keyType === "sms" ? "e.g. sg_live_…" : "e.g. uq_live_…"}
                    onChange={(event) => setForm({ ...form, token: event.target.value })}
                  />
                  <p className="hint">Custom API Key or token. Leave blank to keep the current key. Clear a shown key to generate a new one for this type.</p>
                </label>
                <label>
                  <span>Secret Key</span>
                  <input
                    value={form.secret}
                    maxLength={120}
                    placeholder="Optional: Leave blank to use the same as API Key"
                    onChange={(event) => { setSecretEdited(true); setForm({ ...form, secret: event.target.value }); }}
                  />
                  <p className="hint">Optional secret key for integrations. Defaults to matching the API Key.</p>
                </label>
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
                {issued ? (
                  <div className="key-line">
                    <button className="key-reveal" type="button" onClick={() => void copyIssued()}>{issued}</button>
                    <button className={copied ? "key-copy done" : "key-copy"} type="button" aria-label={copied ? "Copied" : "Copy API key"} onClick={() => void copyIssued()}>
                      {copied ? <span>Copied</span> : <span>Copy</span>}
                    </button>
                  </div>
                ) : null}
                {error ? <p className="error">{error}</p> : null}
                <div className="key-actions">
                  <button className="btn" type="submit" disabled={busy || missing}>{busy ? "Saving…" : "Save"}</button>
                  <Link className="btn-line" href="/admin/api-keys">Cancel</Link>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </form>
    </div>
  );
}
