"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminSession } from "@/hooks/useAdminSession";
import { adminFetch } from "@/lib/admin/api";

type GatewayMode = "live" | "sandbox" | "disabled";

type UddoktaPaySettings = {
  id: "uddoktapay";
  label: string;
  hint: string;
  enabled: boolean;
  sandbox: boolean;
  baseUrl: string;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  configured: boolean;
  mode: GatewayMode;
};

const EMPTY: UddoktaPaySettings = {
  id: "uddoktapay",
  label: "Uddokta Pay",
  hint: "Aggregator for bKash, Nagad, Rocket, and Upay.",
  enabled: false,
  sandbox: false,
  baseUrl: "",
  hasApiKey: false,
  hasWebhookSecret: false,
  configured: false,
  mode: "disabled",
};

export default function PaymentGatewaysPage() {
  const { permissions, error: sessionError, loading } = useAdminSession();
  const [form, setForm] = useState(EMPTY);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading || sessionError) return;
    let cancelled = false;
    async function load() {
      const result = await adminFetch<UddoktaPaySettings>("/payment-gateways/uddoktapay");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setForm(result.data);
      setReady(true);
      setError(null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, sessionError]);

  async function save() {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await adminFetch<UddoktaPaySettings>("/payment-gateways/uddoktapay", {
      method: "PATCH",
      body: JSON.stringify({
        enabled: form.enabled,
        sandbox: form.sandbox,
        baseUrl: form.baseUrl,
        apiKey,
        webhookSecret,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setForm(result.data);
    setApiKey("");
    setWebhookSecret("");
    setNotice("Uddokta Pay saved.");
  }

  return (
    <AdminShell
      title="Payment gateways"
      lead="Turn on Uddokta Pay so checkout can collect bKash, Nagad, Rocket, and Upay."
      permissions={permissions}
    >
      {sessionError || error ? <p className="form-error">{sessionError || error}</p> : null}
      {notice ? <p className="lead">{notice}</p> : null}
      <article className="gateway-card">
        <header className="gateway-card-head">
          <div>
            <p className="manual-card-kicker">Gateway</p>
            <h2>Uddokta Pay</h2>
          </div>
          <span className={`gateway-mode is-${form.mode}`}>{modeLabel(form.mode)}</span>
        </header>
        <p className="lead">{form.hint}</p>
        <label className="gateway-check">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
          />
          Enabled
        </label>
        <label className="gateway-check">
          <input
            type="checkbox"
            checked={form.sandbox}
            onChange={(event) => setForm((current) => ({ ...current, sandbox: event.target.checked }))}
          />
          Sandbox merchant — checkout still opens this gateway URL. The local mock is used only when the gateway is off.
        </label>
        <label className="field">
          Base URL
          <input
            value={form.baseUrl}
            onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
            placeholder="https://yourshop.uddoktapay.com"
            autoComplete="off"
            disabled={!ready}
          />
        </label>
        <label className="field">
          API key {form.hasApiKey ? "(saved — leave blank to keep)" : ""}
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={form.hasApiKey ? "••••••••" : "RT-UDDOKTAPAY-API-KEY"}
            autoComplete="new-password"
            disabled={!ready}
          />
        </label>
        <label className="field">
          Webhook secret {form.hasWebhookSecret ? "(saved — leave blank to keep)" : ""}
          <input
            type="password"
            value={webhookSecret}
            onChange={(event) => setWebhookSecret(event.target.value)}
            placeholder={form.hasWebhookSecret ? "••••••••" : "Optional"}
            autoComplete="new-password"
            disabled={!ready}
          />
        </label>
        <button type="button" className="primary-btn" disabled={!ready || pending} onClick={() => void save()}>
          {pending ? "Saving…" : "Save Uddokta Pay"}
        </button>
      </article>
    </AdminShell>
  );
}

function modeLabel(mode: GatewayMode) {
  if (mode === "live") return "Live";
  if (mode === "sandbox") return "Sandbox";
  return "Off";
}
