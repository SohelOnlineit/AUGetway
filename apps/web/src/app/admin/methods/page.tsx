"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Gateway = {
  id: string;
  label: string;
  internalLabel?: string;
  code: string;
  accountNumber: string;
  instructions: string;
  shiftAmount: boolean;
  active: boolean;
  sortOrder: number;
  minAmount: string;
  maxAmount: string;
  fixedCharge: string;
  percentageCharge: string;
  fixedDiscount: string;
  percentageDiscount: string;
};

type Draft = {
  id?: string;
  label: string;
  code: string;
  accountNumber: string;
  instructions: string;
  minAmount: string;
  maxAmount: string;
  fixedCharge: string;
  percentageCharge: string;
  fixedDiscount: string;
  percentageDiscount: string;
  shiftAmount: boolean;
  active: boolean;
};

const templates: Array<[string, string, number]> = [
  ["bKash Merchant", "Bkash Personal", 25000],
  ["Nagad Personal", "Nagad Personal", 25000],
  ["Rocket Personal", "Rocket Personal", 25000],
  ["Upay Personal", "Upay Personal", 25000],
  ["BanglaQR", "BanglaQR", 50000],
  ["Brac Bank", "Brac Bank", 500000],
  ["City Bank", "City Bank", 500000],
  ["Eastern Bank", "Eastern Bank", 500000],
  ["Islami Bank", "Islami Bank", 500000],
  ["Dutch-Bangla Bank", "Dutch-Bangla Bank", 500000],
];

function blankDraft(partial?: Partial<Draft>): Draft {
  return {
    label: "",
    code: "",
    accountNumber: "",
    instructions: "",
    minAmount: "1",
    maxAmount: "25000",
    fixedCharge: "0",
    percentageCharge: "0",
    fixedDiscount: "0",
    percentageDiscount: "0",
    shiftAmount: false,
    active: true,
    ...partial,
  };
}

function fromRow(row: Gateway): Draft {
  return blankDraft({
    id: row.id,
    label: row.label,
    code: row.code,
    accountNumber: row.accountNumber,
    instructions: row.instructions,
    minAmount: String(Number(row.minAmount)),
    maxAmount: String(Number(row.maxAmount)),
    fixedCharge: String(Number(row.fixedCharge)),
    percentageCharge: String(Number(row.percentageCharge)),
    fixedDiscount: String(Number(row.fixedDiscount)),
    percentageDiscount: String(Number(row.percentageDiscount)),
    shiftAmount: row.shiftAmount,
    active: row.active,
  });
}

function payload(draft: Draft) {
  return {
    label: draft.label,
    code: draft.code || draft.label,
    accountNumber: draft.accountNumber,
    instructions: draft.instructions,
    minAmount: Number(draft.minAmount),
    maxAmount: Number(draft.maxAmount),
    fixedCharge: Number(draft.fixedCharge || 0),
    percentageCharge: Number(draft.percentageCharge || 0),
    fixedDiscount: Number(draft.fixedDiscount || 0),
    percentageDiscount: Number(draft.percentageDiscount || 0),
    active: draft.active,
  };
}

function GripIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></svg>;
}

function markKind(label: string) {
  const value = label.toLowerCase();
  if (value.includes("bkash") || value.includes("bikash")) return "bkash";
  if (value.includes("nagad")) return "nagad";
  if (value.includes("rocket")) return "rocket";
  if (value.includes("upay") || value.includes("upai")) return "upay";
  if (value.includes("qr")) return "banglaqr";
  return "bank";
}

function pretty(value: string) {
  const amount = Number(value);
  return amount.toLocaleString("en-US", { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 });
}

export default function MethodsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Gateway[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<"label" | "minAmount" | "maxAmount" | "sortOrder">("sortOrder");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [picked, setPicked] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [dragId, setDragId] = useState("");
  const [overId, setOverId] = useState("");

  async function load() {
    setRows(await api<Gateway[]>("/desk/methods"));
  }

  useEffect(() => {
    load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = rows.filter((row) => !needle || `${row.label} ${row.code}`.toLowerCase().includes(needle));
    next.sort((a, b) => {
      const left = sortKey === "label" ? a.label : sortKey === "sortOrder" ? a.sortOrder : Number(a[sortKey]);
      const right = sortKey === "label" ? b.label : sortKey === "sortOrder" ? b.sortOrder : Number(b[sortKey]);
      const compared = left < right ? -1 : left > right ? 1 : 0;
      return sortDir === "asc" ? compared : -compared;
    });
    return next;
  }, [rows, query, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * perPage;
  const visible = filtered.slice(start, start + perPage);
  const allVisible = visible.length > 0 && visible.every((row) => picked.includes(row.id));

  function sortBy(key: "label" | "minAmount" | "maxAmount") {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  async function toggle(row: Gateway) {
    setError("");
    try {
      await api(`/desk/methods/${row.id}`, { method: "PATCH", body: JSON.stringify(payload({ ...fromRow(row), active: !row.active })) });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update status");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setError("");
    try {
      const saved = await api<{ id: string }>(draft.id ? `/desk/methods/${draft.id}` : "/desk/methods", {
        method: draft.id ? "PATCH" : "POST",
        body: JSON.stringify(payload(draft)),
      });
      setDraft(null);
      if (!draft.id) {
        router.push(`/admin/gateways/${saved.id}`);
        return;
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    }
  }

  async function reorder(fromId: string, toId: string) {
    if (!fromId || fromId === toId || query.trim()) return;
    const ordered = [...filtered];
    const from = ordered.findIndex((row) => row.id === fromId);
    const to = ordered.findIndex((row) => row.id === toId);
    if (from < 0 || to < 0) return;
    const [item] = ordered.splice(from, 1);
    ordered.splice(to, 0, item);
    const next = ordered.map((row, index) => ({ ...row, sortOrder: index + 1 }));
    setRows(next);
    setSortKey("sortOrder");
    setSortDir("asc");
    setError("");
    try {
      await api("/desk/methods/reorder", { method: "POST", body: JSON.stringify({ ids: next.map((row) => row.id) }) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the order");
      await load();
    }
  }

  async function removeSelected() {
    if (picked.length === 0) return;
    setError("");
    try {
      await api("/desk/methods/bulk-delete", { method: "POST", body: JSON.stringify({ ids: picked }) });
      setPicked([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    }
  }

  const onCount = rows.filter((row) => row.active).length;
  const withAccount = rows.filter((row) => row.accountNumber.trim()).length;

  return (
    <div className="ogw-page">
      {error ? <p className="error">{error}</p> : null}
      <header className="ogw-head">
        <div>
          <p className="ogw-kicker">Payment Gateways</p>
          <h2>Manual Gateway</h2>
          <p>Drag a row up or down. The top gateway is offered first at checkout.</p>
        </div>
        <div className="mgw-actions">
          <Link className="ogw-back" href="/admin/gateways">Payment Gateways</Link>
          <button className="mgw-new" type="button" onClick={() => { setPicking(true); setDraft(null); }}>New gateway</button>
        </div>
      </header>
      <div className="ogw-stats">
        <article><b>{rows.length}</b><small>Gateways</small></article>
        <article><b>{onCount}</b><small>Turned on</small></article>
        <article><b>{withAccount}</b><small>With account</small></article>
        <article><b>{rows.length - withAccount}</b><small>Need a number</small></article>
      </div>
      <section className="ogw-card">
        <div className="ogw-tools">
          {picked.length > 0 ? <button className="ogw-delete" type="button" onClick={removeSelected}>Delete {picked.length}</button> : null}
          <label className="ogw-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              value={query}
              placeholder="Search gateways"
              aria-label="Search gateways"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className="ogw-scroll">
        <table className="ogw-table">
          <thead>
            <tr>
              <th aria-label="Reorder" />
              <th>
                <input
                  type="checkbox"
                  checked={allVisible}
                  onChange={() => setPicked(allVisible ? picked.filter((id) => !visible.some((row) => row.id === id)) : [...new Set([...picked, ...visible.map((row) => row.id)])])}
                />
              </th>
              <th><button type="button" onClick={() => sortBy("label")}>Gateway {sortKey === "label" ? (sortDir === "asc" ? "↑" : "↓") : ""}</button></th>
              <th>Code</th>
              <th><button type="button" onClick={() => sortBy("minAmount")}>Min {sortKey === "minAmount" ? (sortDir === "asc" ? "↑" : "↓") : ""}</button></th>
              <th><button type="button" onClick={() => sortBy("maxAmount")}>Max {sortKey === "maxAmount" ? (sortDir === "asc" ? "↑" : "↓") : ""}</button></th>
              <th>Account</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              return (
              <tr
                key={row.id}
                className={overId === row.id && dragId !== row.id ? "gw-over" : dragId === row.id ? "gw-dragging" : ""}
                onDragOver={(event) => {
                  if (!dragId || query.trim()) return;
                  event.preventDefault();
                  if (overId !== row.id) setOverId(row.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = event.dataTransfer.getData("text/plain") || dragId;
                  setDragId("");
                  setOverId("");
                  void reorder(from, row.id);
                }}
              >
                <td>
                  <button
                    className="gw-grip"
                    type="button"
                    draggable={!query.trim()}
                    aria-label={`Drag ${row.label}`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", row.id);
                      setDragId(row.id);
                    }}
                    onDragEnd={() => { setDragId(""); setOverId(""); }}
                  >
                    <GripIcon />
                  </button>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={picked.includes(row.id)}
                    onChange={() => setPicked(picked.includes(row.id) ? picked.filter((id) => id !== row.id) : [...picked, row.id])}
                  />
                </td>
                <td>
                  <div className="ogw-name">
                    <span className={`ogw-mark ogw-mark--${markKind(row.label)}`} aria-hidden>{row.label.slice(0, 1)}</span>
                    <div>
                      <strong>{row.label}</strong>
                      <em>Manual number</em>
                    </div>
                  </div>
                </td>
                <td className="ogw-account">{row.code}</td>
                <td className="ogw-limits">{pretty(row.minAmount)}</td>
                <td className="ogw-limits">{pretty(row.maxAmount)}</td>
                <td className="ogw-account">{row.accountNumber || "—"}</td>
                <td>
                  <button className={row.active ? "switch on" : "switch"} type="button" aria-label={row.active ? "Turn off" : "Turn on"} onClick={() => toggle(row)}>
                    <span />
                  </button>
                </td>
                <td><Link className="ogw-edit" href={`/admin/gateways/${row.id}`}>Edit</Link></td>
              </tr>
              );
            })}
            {visible.length === 0 ? <tr><td colSpan={9}>No gateways match.</td></tr> : null}
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

      {picking ? (
        <div className="modal-back" onClick={() => setPicking(false)}>
          <div className="modal ogw-modal" onClick={(event) => event.stopPropagation()}>
            <h2>New gateway</h2>
            <div className="templates">
              {templates.map(([label, code, max]) => (
                <button key={code} type="button" onClick={() => { setDraft(blankDraft({ label, code, maxAmount: String(max) })); setPicking(false); }}>
                  <strong>{label}</strong>
                  <div className="code">{code}</div>
                </button>
              ))}
              <button type="button" onClick={() => { setDraft(blankDraft()); setPicking(false); }}>Blank gateway</button>
            </div>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="modal-back" onClick={() => setDraft(null)}>
          <form className="modal ogw-modal" onClick={(event) => event.stopPropagation()} onSubmit={save}>
            <h2>{draft.id ? "Edit gateway" : "New gateway"}</h2>
            <div className="form-grid">
              <label className="field"><span>Display name</span><input value={draft.label} required onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
              <label className="field"><span>Code</span><input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label>
              <label className="field"><span>Account number</span><input value={draft.accountNumber} onChange={(event) => setDraft({ ...draft, accountNumber: event.target.value })} /></label>
              <label className="field"><span>Minimum</span><input type="number" min={0} value={draft.minAmount} required onChange={(event) => setDraft({ ...draft, minAmount: event.target.value })} /></label>
              <label className="field"><span>Maximum</span><input type="number" min={0} value={draft.maxAmount} required onChange={(event) => setDraft({ ...draft, maxAmount: event.target.value })} /></label>
              <label className="field"><span>Fixed charge</span><input type="number" min={0} step="0.01" value={draft.fixedCharge} onChange={(event) => setDraft({ ...draft, fixedCharge: event.target.value })} /></label>
              <label className="field"><span>Percentage charge</span><input type="number" min={0} max={100} step="0.01" value={draft.percentageCharge} onChange={(event) => setDraft({ ...draft, percentageCharge: event.target.value })} /></label>
              <label className="field"><span>Fixed discount</span><input type="number" min={0} step="0.01" value={draft.fixedDiscount} onChange={(event) => setDraft({ ...draft, fixedDiscount: event.target.value })} /></label>
              <label className="field"><span>Percentage discount</span><input type="number" min={0} max={100} step="0.01" value={draft.percentageDiscount} onChange={(event) => setDraft({ ...draft, percentageDiscount: event.target.value })} /></label>
            </div>
            <label className="field"><span>Instructions</span><textarea rows={3} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /></label>
            <div className="row">
              <button className="btn" type="submit">Save</button>
              <button className="btn-line" type="button" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
