"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { CheckoutCard } from "@uniqpay/types";

type SortKey = "reference" | "gateway" | "amount" | "status" | "sender" | "trx" | "created";
type StatusFilter = "all" | "pending" | "success" | "failed";
type Dialog = "create" | "edit" | "approve" | "delete" | "wipe" | null;

function tone(status: string) {
  if (status === "paid") return { label: "SUCCESS", kind: "ok" as const };
  if (status === "failed" || status === "expired" || status === "cancelled") {
    return { label: status === "expired" ? "EXPIRED" : "FAILED", kind: "bad" as const };
  }
  return { label: "PENDING", kind: "wait" as const };
}

function gatewayKind(label: string) {
  const value = label.toLowerCase();
  if (value.includes("bkash")) return "bkash";
  if (value.includes("nagad")) return "nagad";
  if (value.includes("rocket")) return "rocket";
  if (value.includes("upay")) return "upay";
  return "plain";
}

function moneyMark(currency: string) {
  if (currency === "BDT") return "৳";
  if (currency === "USD") return "$";
  return `${currency} `;
}

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  let hours = date.getHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month}, ${date.getFullYear()} ${hh}:${mm} ${suffix}`;
}

function ago(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(delta)) return "";
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function canApprove(status: string) {
  return status === "open" || status === "waiting" || status === "pending";
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<CheckoutCard[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [picked, setPicked] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [current, setCurrent] = useState<CheckoutCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  function load() {
    api<CheckoutCard[]>("/desk/checkouts")
      .then((list) => {
        setRows(list);
        setReady(true);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load"));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(""), 4000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const gateways = useMemo(() => {
    const names = new Set<string>();
    rows.forEach((row) => {
      if (row.method?.label) names.add(row.method.label);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      const badge = tone(row.status);
      if (statusFilter === "pending" && badge.kind !== "wait") return false;
      if (statusFilter === "success" && badge.kind !== "ok") return false;
      if (statusFilter === "failed" && badge.kind !== "bad") return false;
      if (gatewayFilter !== "all" && row.method?.label !== gatewayFilter) return false;
      if (!needle) return true;
      return [row.reference, row.publicId, row.payerAccount ?? "", row.providerRef ?? "", row.method?.label ?? "", row.payable, badge.label]
        .some((value) => value.toLowerCase().includes(needle));
    });
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const text = (left: string, right: string) => left.localeCompare(right) * factor;
      if (sort === "reference") return text(a.reference, b.reference);
      if (sort === "gateway") return text(a.method?.label ?? "", b.method?.label ?? "");
      if (sort === "amount") return (Number(a.payable) - Number(b.payable)) * factor;
      if (sort === "status") return text(tone(a.status).label, tone(b.status).label);
      if (sort === "sender") return text(a.payerAccount ?? "", b.payerAccount ?? "");
      if (sort === "trx") return text(a.providerRef ?? "", b.providerRef ?? "");
      return (new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()) * factor;
    });
  }, [rows, query, statusFilter, gatewayFilter, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const filterCount = (statusFilter === "all" ? 0 : 1) + (gatewayFilter === "all" ? 0 : 1);
  const pageIds = visible.map((row) => row.publicId);
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((currentDir) => (currentDir === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "created" || key === "amount" ? "desc" : "asc");
    }
  }

  function togglePage() {
    setPicked((current) => (allPicked ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])]));
  }

  function toggleRow(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function copyText(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? "" : current)), 1600);
    } catch {
      setError("Could not copy");
    }
  }

  async function createRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/desk/checkouts", {
        method: "POST",
        body: JSON.stringify({
          reference: String(form.get("reference") ?? ""),
          amount: Number(form.get("amount") ?? 0),
        }),
      });
      setDialog(null);
      setNote("Transaction created");
      setPage(1);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/desk/checkouts/${current.publicId}`, {
        method: "PATCH",
        body: JSON.stringify({
          reference: String(form.get("reference") ?? ""),
          amount: Number(form.get("amount") ?? current.amount),
          payerAccount: String(form.get("payerAccount") ?? ""),
          providerRef: String(form.get("providerRef") ?? ""),
        }),
      });
      setDialog(null);
      setCurrent(null);
      setNote("Transaction updated");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    const providerRef = String(form.get("providerRef") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await api(`/desk/checkouts/${current.publicId}/confirm`, {
        method: "POST",
        body: JSON.stringify(providerRef ? { providerRef } : {}),
      });
      setDialog(null);
      setCurrent(null);
      setNote("Transaction marked as SUCCESS");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  async function removeOne() {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/desk/checkouts/${current.publicId}`, { method: "DELETE" });
      setPicked((list) => list.filter((id) => id !== current.publicId));
      setDialog(null);
      setCurrent(null);
      setNote("Transaction deleted");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function removePicked() {
    if (!picked.length || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/desk/checkouts/bulk-delete", { method: "POST", body: JSON.stringify({ ids: picked }) });
      setPicked([]);
      setNote("Selected transactions deleted");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function removeAll() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/desk/checkouts/delete-all", { method: "POST", body: "{}" });
      setPicked([]);
      setDialog(null);
      setNote("All transactions deleted");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setCurrent(null);
    setError("");
  }

  const amountLocked = current ? current.status !== "open" || current.amount !== current.payable : false;
  const pages = pageButtons(safePage, pageCount);

  return (
    <div className="txn-page">
      <header className="txn-head">
        <div>
          <p className="txn-crumb">Transactions <span>›</span> List</p>
          <h2>Transactions</h2>
        </div>
        <div className="txn-head-actions">
          {picked.length ? (
            <button className="txn-wipe" type="button" onClick={removePicked} disabled={busy}>
              Delete selected ({picked.length})
            </button>
          ) : null}
          <button className="txn-new" type="button" onClick={() => { setError(""); setDialog("create"); }}>
            <PlusIcon /> New Transaction
          </button>
          <button className="txn-wipe" type="button" onClick={() => { setError(""); setDialog("wipe"); }}>
            <TrashIcon /> Delete All
          </button>
        </div>
      </header>
      {note ? <p className="txn-note">{note}</p> : null}
      {error && !dialog ? <p className="error">{error}</p> : null}

      <section className="txn-card">
        <div className="txn-tools">
          <label className="txn-search">
            <SearchIcon />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search" aria-label="Search transactions" />
          </label>
          <div className="txn-filter-wrap">
            <button className="txn-filter" type="button" aria-label="Filter" onClick={() => setFiltersOpen((open) => !open)}>
              <FilterIcon />
              {filterCount ? <span>{filterCount}</span> : null}
            </button>
            {filtersOpen ? (
              <div className="txn-filter-pop">
                <label>
                  <span>Status</span>
                  <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1); }}>
                    <option value="all">All</option>
                    <option value="pending">PENDING</option>
                    <option value="success">SUCCESS</option>
                    <option value="failed">FAILED</option>
                  </select>
                </label>
                <label>
                  <span>Gateway</span>
                  <select value={gatewayFilter} onChange={(event) => { setGatewayFilter(event.target.value); setPage(1); }}>
                    <option value="all">All</option>
                    {gateways.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <div className="txn-scroll">
          <table className="txn-table">
            <thead>
              <tr>
                <th className="txn-check">
                  <input type="checkbox" checked={allPicked} onChange={togglePage} aria-label="Select this page" />
                </th>
                <SortHead label="Reference / Invoice" active={sort === "reference"} dir={dir} onClick={() => toggleSort("reference")} />
                <SortHead label="Gateway" active={sort === "gateway"} dir={dir} onClick={() => toggleSort("gateway")} />
                <SortHead label="Amount" active={sort === "amount"} dir={dir} onClick={() => toggleSort("amount")} />
                <SortHead label="Status" active={sort === "status"} dir={dir} onClick={() => toggleSort("status")} />
                <SortHead label="Sender Number" active={sort === "sender"} dir={dir} onClick={() => toggleSort("sender")} />
                <SortHead label="TrxID" active={sort === "trx"} dir={dir} onClick={() => toggleSort("trx")} />
                <SortHead label="Date & Time" active={sort === "created"} dir={dir} onClick={() => toggleSort("created")} />
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => {
                const badge = tone(row.status);
                const mark = moneyMark(row.currency);
                return (
                  <tr key={row.publicId} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                    <td className="txn-check">
                      <input type="checkbox" checked={picked.includes(row.publicId)} onChange={() => toggleRow(row.publicId)} aria-label={`Select ${row.reference}`} />
                    </td>
                    <td>
                      <button className="txn-ref" type="button" onClick={() => copyText(row.publicId, row.reference)}>
                        {copied === row.publicId ? "Copied" : row.reference}
                      </button>
                      <p>Pay ID: {row.publicId}</p>
                    </td>
                    <td>
                      {row.method?.label ? (
                        <span className={`txn-gw ${gatewayKind(row.method.label)}`}>
                          <BoltIcon /> {row.method.label}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      <strong className="txn-amt">{mark} {row.payable}</strong>
                      {row.amount !== row.payable ? <p>Base {mark} {row.amount}</p> : null}
                    </td>
                    <td>
                      <span className={`txn-status ${badge.kind}`}>
                        {badge.kind === "ok" ? <CheckIcon /> : badge.kind === "wait" ? <ClockIcon /> : <CrossIcon />}
                        {badge.label}
                      </span>
                    </td>
                    <td className="txn-mono">{row.payerAccount || "—"}</td>
                    <td className={row.providerRef ? "txn-trx" : "txn-mono"}>{row.providerRef || "—"}</td>
                    <td>
                      <strong className="txn-when">{row.createdAt ? stamp(row.createdAt) : "—"}</strong>
                      {row.createdAt ? <p>{ago(row.createdAt)}</p> : null}
                    </td>
                    <td className="txn-actions">
                      {canApprove(row.status) ? (
                        <button type="button" className="txn-go" onClick={() => { setCurrent(row); setError(""); setDialog("approve"); }}>
                          <CheckIcon /> Approve
                        </button>
                      ) : null}
                      <button type="button" className="txn-go" onClick={() => { setCurrent(row); setError(""); setDialog("edit"); }}>
                        <PencilIcon /> Edit
                      </button>
                      <button type="button" className="txn-drop" aria-label={`Delete ${row.reference}`} onClick={() => { setCurrent(row); setError(""); setDialog("delete"); }}>
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ready && !visible.length ? (
            <div className="txn-empty">
              <strong>{query || filterCount ? "No matches" : "No transactions yet"}</strong>
              <p>{query || filterCount ? "Nothing in this list matches that search." : "Create a transaction and the payment link will show up here."}</p>
            </div>
          ) : null}
        </div>

        <footer className="txn-foot">
          <span>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} results</span>
          <label>
            Per page
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page">
              {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="txn-pages">
            <button type="button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
            {pages.map((item, index) => (
              item === "…" ? <span key={`gap-${index}`}>…</span> : (
                <button key={item} type="button" className={item === safePage ? "on" : ""} onClick={() => setPage(item)}>{item}</button>
              )
            ))}
            <button type="button" aria-label="Next page" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>›</button>
          </div>
        </footer>
      </section>

      {dialog === "create" ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <form className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()} onSubmit={createRow}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>New transaction</h2></div></div>
            <div className="dev-modal-body">
              <label><span>Reference / Invoice</span><input name="reference" required minLength={2} maxLength={80} /></label>
              <label><span>Amount (BDT)</span><input name="amount" type="number" min={1} step="0.01" required /></label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-new" type="submit" disabled={busy}>Create</button>
            </div>
          </form>
        </div>
      ) : null}

      {dialog === "edit" && current ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <form className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()} onSubmit={saveEdit}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Edit transaction</h2></div></div>
            <div className="dev-modal-body">
              <label><span>Reference / Invoice</span><input name="reference" required minLength={2} maxLength={80} defaultValue={current.reference} /></label>
              <label>
                <span>Amount (BDT)</span>
                <input name="amount" type="number" min={1} step="0.01" required defaultValue={current.amount} disabled={amountLocked} />
              </label>
              <label><span>Sender number</span><input name="payerAccount" maxLength={11} defaultValue={current.payerAccount ?? ""} placeholder="01XXXXXXXXX" /></label>
              <label><span>Transaction ID</span><input name="providerRef" maxLength={20} defaultValue={current.providerRef ?? ""} placeholder="8N70O2M4RB" /></label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-new" type="submit" disabled={busy}>Save</button>
            </div>
          </form>
        </div>
      ) : null}

      {dialog === "approve" && current ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <form className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()} onSubmit={approve}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Approve transaction</h2></div></div>
            <div className="dev-modal-body">
              <p className="txn-copy">Mark {current.reference} as SUCCESS. The customer is notified if a webhook is set.</p>
              <label><span>Transaction ID (optional)</span><input name="providerRef" maxLength={20} defaultValue={current.providerRef ?? ""} placeholder="8N70O2M4RB" /></label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-new" type="submit" disabled={busy}>Approve</button>
            </div>
          </form>
        </div>
      ) : null}

      {dialog === "delete" && current ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <div className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Delete transaction</h2></div></div>
            <div className="dev-modal-body">
              <p className="txn-copy">Delete {current.reference} permanently. This cannot be undone.</p>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-wipe" type="button" onClick={removeOne} disabled={busy}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog === "wipe" ? (
        <div className="modal-back txn-shade" onClick={closeDialog}>
          <div className="modal dev-modal txn-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dev-modal-head"><div><p className="txn-crumb">Transactions</p><h2>Delete all transactions</h2></div></div>
            <div className="dev-modal-body">
              <p className="txn-copy">This permanently deletes every transaction on this desk. It cannot be undone.</p>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={closeDialog}>Cancel</button>
              <button className="txn-wipe" type="button" onClick={removeAll} disabled={busy}>Yes, delete all</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pageButtons(page: number, count: number) {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
  const keep = new Set([1, 2, 3, count - 1, count, page - 1, page, page + 1]);
  const numbers = [...keep].filter((number) => number >= 1 && number <= count).sort((a, b) => a - b);
  const items: Array<number | "…"> = [];
  numbers.forEach((number, index) => {
    if (index > 0 && number - numbers[index - 1] > 1) items.push("…");
    items.push(number);
  });
  return items;
}

function SortHead({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th>
      <button type="button" className={active ? "on" : ""} onClick={onClick}>
        {label}
        <i aria-hidden="true">{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</i>
      </button>
    </th>
  );
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>;
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13" /></svg>;
}
function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
function FilterIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16l-6 7v6l-4 2v-8z" /></svg>;
}
function BoltIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
}
function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m5 12 5 5L20 7" /></svg>;
}
function ClockIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>;
}
function CrossIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M7 7l10 10M17 7 7 17" /></svg>;
}
function PencilIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h4l10-10-4-4L4 16z" /><path d="m13 7 4 4" /></svg>;
}
