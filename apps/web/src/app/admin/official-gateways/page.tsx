"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Provider = "bkash" | "nagad" | "rocket" | "upay" | "banglaqr" | "bank";

type OfficialGateway = {
  id: string;
  provider: Provider;
  label: string;
  mode: "sandbox" | "live";
  active: boolean;
  username: string;
  merchantId: string;
  merchantNumber: string;
  hasPassword: boolean;
  hasAppKey: boolean;
  hasAppSecret: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  code: string;
  minAmount: string;
  maxAmount: string;
  sortOrder: number;
};

type Draft = {
  id?: string;
  provider: Provider;
  label: string;
  mode: "sandbox" | "live";
  active: boolean;
  username: string;
  password: string;
  appKey: string;
  appSecret: string;
  merchantId: string;
  merchantNumber: string;
  publicKey: string;
  privateKey: string;
  hasPassword: boolean;
  hasAppKey: boolean;
  hasAppSecret: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  code: string;
  minAmount: string;
  maxAmount: string;
};

const providers: Array<{ id: Provider; name: string }> = [
  { id: "bkash", name: "bKash" },
  { id: "nagad", name: "Nagad" },
  { id: "rocket", name: "Rocket" },
  { id: "upay", name: "Upay" },
  { id: "banglaqr", name: "BanglaQR" },
];

function blankDraft(provider: Provider): Draft {
  const name = providers.find((item) => item.id === provider)?.name ?? "Official";
  return {
    provider,
    label: `${name} Official`,
    mode: "sandbox",
    active: false,
    username: "",
    password: "",
    appKey: "",
    appSecret: "",
    merchantId: "",
    merchantNumber: "",
    publicKey: "",
    privateKey: "",
    hasPassword: false,
    hasAppKey: false,
    hasAppSecret: false,
    hasPublicKey: false,
    hasPrivateKey: false,
    code: name,
    minAmount: "1",
    maxAmount: "25000",
  };
}

function fromRow(row: OfficialGateway): Draft {
  return {
    ...blankDraft(row.provider),
    id: row.id,
    label: row.label,
    mode: row.mode,
    active: row.active,
    username: row.username,
    merchantId: row.merchantId,
    merchantNumber: row.merchantNumber,
    hasPassword: row.hasPassword,
    hasAppKey: row.hasAppKey,
    hasAppSecret: row.hasAppSecret,
    hasPublicKey: row.hasPublicKey,
    hasPrivateKey: row.hasPrivateKey,
    code: row.code,
    minAmount: row.minAmount,
    maxAmount: row.maxAmount,
  };
}

function pretty(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value || "—";
  return amount.toLocaleString("en-US", { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 });
}

function apiSaved(row: OfficialGateway) {
  if (row.provider === "bkash") return Boolean(row.username && row.hasPassword && row.hasAppKey && row.hasAppSecret);
  if (row.provider === "nagad") return Boolean(row.merchantId && row.merchantNumber && row.hasPublicKey && row.hasPrivateKey);
  if (row.provider === "rocket") return Boolean(row.merchantId && row.hasPassword);
  if (row.provider === "upay" || row.provider === "banglaqr") return Boolean(row.merchantId && row.hasAppKey && row.hasAppSecret);
  return false;
}

function accountOf(row: Pick<OfficialGateway, "provider" | "username" | "merchantId" | "merchantNumber">) {
  if (row.provider === "bkash") return row.username || "—";
  if (row.provider === "nagad") return row.merchantNumber || row.merchantId || "—";
  return row.merchantId || "—";
}

export default function OfficialGatewaysPage() {
  const [rows, setRows] = useState<OfficialGateway[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [picked, setPicked] = useState<string[]>([]);

  async function load() {
    setRows(await api<OfficialGateway[]>("/desk/official-gateways"));
  }

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load official gateways"));
  }, []);

  function patch(next: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    const body = {
      provider: draft.provider,
      label: draft.label,
      mode: draft.mode,
      active: draft.active,
      username: draft.username,
      merchantId: draft.merchantId,
      merchantNumber: draft.merchantNumber,
      code: draft.code,
      minAmount: draft.minAmount,
      maxAmount: draft.maxAmount,
      ...(draft.password ? { password: draft.password } : {}),
      ...(draft.appKey ? { appKey: draft.appKey } : {}),
      ...(draft.appSecret ? { appSecret: draft.appSecret } : {}),
      ...(draft.publicKey ? { publicKey: draft.publicKey } : {}),
      ...(draft.privateKey ? { privateKey: draft.privateKey } : {}),
    };
    try {
      await api(draft.id ? `/desk/official-gateways/${draft.id}` : "/desk/official-gateways", {
        method: draft.id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setDraft(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: OfficialGateway) {
    setError("");
    try {
      await api(`/desk/official-gateways/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          provider: row.provider,
          label: row.label,
          mode: row.mode,
          active: !row.active,
          username: row.username,
          merchantId: row.merchantId,
          merchantNumber: row.merchantNumber,
        }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update");
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? rows.filter((row) => [row.label, row.code, accountOf(row)].join(" ").toLowerCase().includes(needle))
      : rows;
    return list;
  }, [rows, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * perPage;
  const visible = filtered.slice(start, start + perPage);
  const allVisible = visible.length > 0 && visible.every((row) => picked.includes(row.id));
  const secretHint = "Saved. Leave blank to keep it.";

  async function removeSelected() {
    if (picked.length === 0) return;
    setError("");
    try {
      await Promise.all(picked.map((id) => api(`/desk/official-gateways/${id}`, { method: "DELETE" })));
      setPicked([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    }
  }

  const savedCount = rows.filter(apiSaved).length;
  const liveCount = rows.filter((row) => row.mode === "live").length;
  const onCount = rows.filter((row) => row.active).length;

  return (
    <div className="ogw-page">
      {error ? <p className="error">{error}</p> : null}
      <header className="ogw-head">
        <div>
          <p className="ogw-kicker">Payment Gateways</p>
          <h2>Official Gateway</h2>
          <p>Save the official API for bKash, Nagad, Rocket, Upay or BanglaQR, then turn it on.</p>
        </div>
        <Link className="ogw-back" href="/admin/gateways">Payment Gateways</Link>
      </header>
      <div className="ogw-stats">
        <article><b>{rows.length}</b><small>Gateways</small></article>
        <article><b>{savedCount}</b><small>API saved</small></article>
        <article><b>{liveCount}</b><small>Live mode</small></article>
        <article><b>{onCount}</b><small>Turned on</small></article>
      </div>
      <section className="ogw-card">
        <div className="ogw-tools">
          {picked.length > 0 ? <button className="ogw-delete" type="button" onClick={() => void removeSelected()}>Delete {picked.length}</button> : null}
          <label className="ogw-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={query} placeholder="Search gateways" aria-label="Search gateways" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </label>
        </div>
        <div className="ogw-scroll">
        <table className="ogw-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisible}
                  onChange={() => setPicked(allVisible ? picked.filter((id) => !visible.some((row) => row.id === id)) : [...new Set([...picked, ...visible.map((row) => row.id)])])}
                />
              </th>
              <th>Gateway</th>
              <th>Mode</th>
              <th>API</th>
              <th>Limits</th>
              <th>Account</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={picked.includes(row.id)}
                    onChange={() => setPicked(picked.includes(row.id) ? picked.filter((id) => id !== row.id) : [...picked, row.id])}
                  />
                </td>
                <td>
                  <div className="ogw-name">
                    <span className={`ogw-mark ogw-mark--${row.provider}`} aria-hidden>{row.label.slice(0, 1)}</span>
                    <div>
                      <strong>{row.label}</strong>
                      <em>{row.code && row.code !== row.label ? row.code : "Official API"}</em>
                    </div>
                  </div>
                </td>
                <td><span className={row.mode === "live" ? "ogw-pill ogw-pill--live" : "ogw-pill"}>{row.mode === "live" ? "Live" : "Sandbox"}</span></td>
                <td><span className={apiSaved(row) ? "ogw-pill ogw-pill--ok" : "ogw-pill ogw-pill--wait"}>{apiSaved(row) ? "Saved" : "Needed"}</span></td>
                <td className="ogw-limits">{pretty(row.minAmount)} – {pretty(row.maxAmount)}</td>
                <td className="ogw-account">{accountOf(row)}</td>
                <td>
                  <button className={row.active ? "switch on" : "switch"} type="button" aria-label={row.active ? "Turn off" : "Turn on"} onClick={() => toggle(row)}>
                    <span />
                  </button>
                </td>
                <td><button className="ogw-edit" type="button" onClick={() => setDraft(fromRow(row))}>API</button></td>
              </tr>
            ))}
            {visible.length === 0 ? <tr><td colSpan={8}>No official gateways match.</td></tr> : null}
          </tbody>
        </table>
        </div>
        <div className="ogw-foot">
          <span>Showing {filtered.length === 0 ? 0 : start + 1} to {Math.min(start + perPage, filtered.length)} of {filtered.length}</span>
          <label>Per page <select value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
          <div className="ogw-pages">
            <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))}>‹</button>
            {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
              <button key={number} type="button" className={number === safePage ? "on" : ""} onClick={() => setPage(number)}>{number}</button>
            ))}
            <button type="button" onClick={() => setPage(Math.min(pages, safePage + 1))}>›</button>
          </div>
        </div>
      </section>

      {draft ? (
        <div className="modal-back" onClick={() => setDraft(null)}>
          <form className="modal ogw-modal" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <h2>{providers.find((item) => item.id === draft.provider)?.name ?? draft.label} API</h2>
            <div className="form-grid">
              <label className="field"><span>Display name</span><input value={draft.label} required maxLength={80} onChange={(event) => patch({ label: event.target.value })} /></label>
              <label className="field"><span>Code</span><input value={draft.code} maxLength={80} onChange={(event) => patch({ code: event.target.value })} /></label>
              <label className="field"><span>Minimum</span><input value={draft.minAmount} onChange={(event) => patch({ minAmount: event.target.value })} /></label>
              <label className="field"><span>Maximum</span><input value={draft.maxAmount} onChange={(event) => patch({ maxAmount: event.target.value })} /></label>
              <label className="field">
                <span>Mode</span>
                <select value={draft.mode} onChange={(event) => patch({ mode: event.target.value === "live" ? "live" : "sandbox" })}>
                  <option value="sandbox">Sandbox</option>
                  <option value="live">Live</option>
                </select>
              </label>
              {draft.provider === "bkash" ? (
                <>
                  <label className="field"><span>Username</span><input value={draft.username} maxLength={120} onChange={(event) => patch({ username: event.target.value })} /></label>
                  <label className="field"><span>Password</span><input type="password" value={draft.password} placeholder={draft.hasPassword ? secretHint : ""} autoComplete="new-password" onChange={(event) => patch({ password: event.target.value })} /></label>
                  <label className="field"><span>App key</span><input value={draft.appKey} placeholder={draft.hasAppKey ? secretHint : ""} autoComplete="off" onChange={(event) => patch({ appKey: event.target.value })} /></label>
                  <label className="field"><span>App secret</span><input type="password" value={draft.appSecret} placeholder={draft.hasAppSecret ? secretHint : ""} autoComplete="new-password" onChange={(event) => patch({ appSecret: event.target.value })} /></label>
                </>
              ) : null}
              {draft.provider === "nagad" ? (
                <>
                  <label className="field"><span>Merchant ID</span><input value={draft.merchantId} maxLength={80} onChange={(event) => patch({ merchantId: event.target.value })} /></label>
                  <label className="field"><span>Merchant number</span><input value={draft.merchantNumber} maxLength={40} onChange={(event) => patch({ merchantNumber: event.target.value })} /></label>
                </>
              ) : null}
              {draft.provider === "rocket" ? (
                <>
                  <label className="field"><span>Merchant ID</span><input value={draft.merchantId} maxLength={80} onChange={(event) => patch({ merchantId: event.target.value })} /></label>
                  <label className="field"><span>Password</span><input type="password" value={draft.password} placeholder={draft.hasPassword ? secretHint : ""} autoComplete="new-password" onChange={(event) => patch({ password: event.target.value })} /></label>
                </>
              ) : null}
              {draft.provider === "upay" || draft.provider === "banglaqr" ? (
                <>
                  <label className="field"><span>Merchant ID</span><input value={draft.merchantId} maxLength={80} onChange={(event) => patch({ merchantId: event.target.value })} /></label>
                  <label className="field"><span>API key</span><input value={draft.appKey} placeholder={draft.hasAppKey ? secretHint : ""} autoComplete="off" onChange={(event) => patch({ appKey: event.target.value })} /></label>
                  <label className="field"><span>API secret</span><input type="password" value={draft.appSecret} placeholder={draft.hasAppSecret ? secretHint : ""} autoComplete="new-password" onChange={(event) => patch({ appSecret: event.target.value })} /></label>
                </>
              ) : null}
            </div>
            {draft.provider === "nagad" ? (
              <>
                <label className="field"><span>PG public key</span><textarea rows={4} value={draft.publicKey} placeholder={draft.hasPublicKey ? secretHint : "Paste the Nagad PG public key"} onChange={(event) => patch({ publicKey: event.target.value })} /></label>
                <label className="field"><span>Merchant private key</span><textarea rows={4} value={draft.privateKey} placeholder={draft.hasPrivateKey ? secretHint : "Paste the merchant private key"} onChange={(event) => patch({ privateKey: event.target.value })} /></label>
              </>
            ) : null}
            <label className="field"><span>Turn this official gateway on</span><input type="checkbox" checked={draft.active} onChange={(event) => patch({ active: event.target.checked })} /></label>
            <div className="row">
              <button className="btn" type="submit" disabled={busy}>{busy ? "Saving" : "Save"}</button>
              <button className="btn-line" type="button" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
