"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Bill = {
  number: string;
  customerName: string;
  customerEmail: string | null;
  title: string;
  total: string;
  currency: string;
  status: string;
  note: string;
  dueOn: string | null;
  createdAt: string;
};
type Col = "number" | "customer" | "amount" | "status" | "due" | "created";
type SortKey = "number" | "customer" | "amount" | "due" | "created";

const columns: { key: Col; label: string; sort?: SortKey }[] = [
  { key: "number", label: "Invoice #", sort: "number" },
  { key: "customer", label: "Customer", sort: "customer" },
  { key: "amount", label: "Total Amount", sort: "amount" },
  { key: "status", label: "Status" },
  { key: "due", label: "Due date", sort: "due" },
  { key: "created", label: "Created", sort: "created" },
];

function moneyLabel(currency: string, amount: string) {
  const value = Number(amount);
  const shown = Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount;
  return `${currency || "BDT"} ${shown}`;
}

function stamp(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${day} ${month}, ${date.getUTCFullYear()}`;
}

function statusOf(status: string) {
  if (status === "paid") return { label: "PAID", kind: "paid" };
  if (status === "cancelled") return { label: "CANCELLED", kind: "cancelled" };
  return { label: "DUE", kind: "due" };
}

export default function BillsPage() {
  const [rows, setRows] = useState<Bill[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [shown, setShown] = useState<Record<Col, boolean>>({
    number: true,
    customer: true,
    amount: true,
    status: true,
    due: true,
    created: false,
  });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<Bill[]>("/desk/bills")
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (!needle) return true;
      return [row.number, row.customerName, row.customerEmail ?? "", row.title, row.total, row.status, statusOf(row.status).label]
        .some((value) => value.toLowerCase().includes(needle));
    });
    const factor = dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort === "number") return a.number.localeCompare(b.number) * factor;
      if (sort === "customer") return a.customerName.localeCompare(b.customerName) * factor;
      if (sort === "amount") return (Number(a.total) - Number(b.total)) * factor;
      const left = a.dueOn ?? "";
      const right = b.dueOn ?? "";
      if (sort === "due") return left.localeCompare(right) * factor;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * factor;
    });
  }, [rows, query, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const pageIds = visible.map((row) => row.number);
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id));
  const visibleCols = columns.filter((column) => shown[column.key]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "customer" || key === "number" ? "asc" : "desc");
    }
  }

  async function createBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customerEmail = String(form.get("customerEmail") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await api("/desk/bills", {
        method: "POST",
        body: JSON.stringify({
          customerName: String(form.get("customerName") ?? ""),
          ...(customerEmail ? { customerEmail } : {}),
          title: String(form.get("title") ?? ""),
          total: Number(form.get("total") ?? 0),
          note: String(form.get("note") ?? ""),
          dueOn: String(form.get("dueOn") ?? ""),
        }),
      });
      setCreating(false);
      setNote("Invoice created");
      setPage(1);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  async function saveBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/desk/bills/${editing.number}`, {
        method: "PATCH",
        body: JSON.stringify({
          customerName: String(form.get("customerName") ?? ""),
          customerEmail: String(form.get("customerEmail") ?? ""),
          title: String(form.get("title") ?? ""),
          total: Number(form.get("total") ?? 0),
          note: String(form.get("note") ?? ""),
          dueOn: String(form.get("dueOn") ?? ""),
          status: String(form.get("status") ?? "due"),
        }),
      });
      setEditing(null);
      setNote("Invoice updated");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function removePicked() {
    if (!picked.length || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/desk/bills/bulk-delete", { method: "POST", body: JSON.stringify({ ids: picked }) });
      setPicked([]);
      setNote("Selected invoices deleted");
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  const pages = pageButtons(safePage, pageCount);

  return (
    <div className="inv-page">
      <header className="inv-head">
        <div>
          <p className="inv-crumb">Invoices <span>›</span> List</p>
          <h2>Invoices</h2>
        </div>
        <div className="inv-head-actions">
          {picked.length ? (
            <button className="inv-drop" type="button" onClick={removePicked} disabled={busy}>Delete selected ({picked.length})</button>
          ) : null}
          <button className="inv-new" type="button" onClick={() => { setError(""); setCreating(true); }}>New invoice</button>
        </div>
      </header>
      {note ? <p className="inv-note">{note}</p> : null}
      {error && !creating && !editing ? <p className="error">{error}</p> : null}

      <section className="inv-card">
        <div className="inv-tools">
          <label className="inv-search">
            <SearchIcon />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search" aria-label="Search invoices" />
          </label>
          <div className="inv-cols-wrap">
            <button className="inv-cols" type="button" aria-label="Columns" onClick={() => setColumnsOpen((open) => !open)}>
              <ColsIcon />
            </button>
            {columnsOpen ? (
              <div className="inv-menu">
                {columns.map((column) => (
                  <label key={column.key}>
                    <input
                      type="checkbox"
                      checked={shown[column.key]}
                      onChange={() => setShown((current) => ({ ...current, [column.key]: !current[column.key] }))}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="inv-scroll">
          <table className="inv-table">
            <thead>
              <tr>
                <th className="inv-check">
                  <input type="checkbox" checked={allPicked} onChange={() => setPicked((current) => (allPicked ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])]))} aria-label="Select this page" />
                </th>
                {visibleCols.map((column) => (
                  <th key={column.key}>
                    {column.sort ? (
                      <button type="button" className={sort === column.sort ? "on" : ""} onClick={() => toggleSort(column.sort!)}>
                        {column.label}
                        <i aria-hidden="true">{sort === column.sort ? (dir === "asc" ? "↑" : "↓") : "↕"}</i>
                      </button>
                    ) : column.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => {
                const badge = statusOf(row.status);
                return (
                  <tr key={row.number} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                    <td className="inv-check">
                      <input
                        type="checkbox"
                        checked={picked.includes(row.number)}
                        onChange={() => setPicked((current) => (current.includes(row.number) ? current.filter((id) => id !== row.number) : [...current, row.number]))}
                        aria-label={`Select ${row.number}`}
                      />
                    </td>
                    {shown.number ? <td className="inv-num">{row.number}</td> : null}
                    {shown.customer ? (
                      <td>
                        <strong>{row.customerName}</strong>
                        {row.title ? <p>{row.title}</p> : null}
                      </td>
                    ) : null}
                    {shown.amount ? <td className="inv-amt">{moneyLabel(row.currency, row.total)}</td> : null}
                    {shown.status ? <td><span className={`inv-status ${badge.kind}`}>{badge.label}</span></td> : null}
                    {shown.due ? <td className="inv-when">{stamp(row.dueOn)}</td> : null}
                    {shown.created ? <td className="inv-when">{stamp(row.createdAt)}</td> : null}
                    <td className="inv-actions">
                      <a className="inv-go" href={`/bill/${row.number}`} target="_blank" rel="noreferrer">
                        <LinkIcon /> Payment Link
                      </a>
                      <button className="inv-go" type="button" onClick={() => { setError(""); setEditing(row); }}>
                        <PencilIcon /> Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ready && !visible.length ? (
            <div className="inv-empty">
              <span className="inv-empty-mark" aria-hidden="true"><CrossIcon /></span>
              <strong>{query ? "No matches" : "No invoices"}</strong>
            </div>
          ) : null}
        </div>

        {filtered.length ? (
          <footer className="inv-foot">
            <span>Showing {start + 1} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} results</span>
            <label>
              Per page
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page">
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <div className="inv-pages">
              <button type="button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
              {pages.map((item, index) => (
                item === "…" ? <span key={`gap-${index}`}>…</span> : (
                  <button key={item} type="button" className={item === safePage ? "on" : ""} onClick={() => setPage(item)}>{item}</button>
                )
              ))}
              <button type="button" aria-label="Next page" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>›</button>
            </div>
          </footer>
        ) : null}
      </section>

      {creating ? (
        <div className="modal-back inv-shade" onClick={() => { if (!busy) { setCreating(false); setError(""); } }}>
          <form className="modal dev-modal inv-dialog" onClick={(event) => event.stopPropagation()} onSubmit={createBill}>
            <div className="dev-modal-head"><div><p className="inv-crumb">Invoices</p><h2>New invoice</h2></div></div>
            <div className="dev-modal-body">
              <label><span>Customer</span><input name="customerName" required minLength={2} maxLength={80} /></label>
              <label><span>Email</span><input name="customerEmail" type="email" maxLength={120} /></label>
              <label><span>Title</span><input name="title" required minLength={2} maxLength={120} /></label>
              <label><span>Total amount (BDT)</span><input name="total" type="number" min={1} step="0.01" required /></label>
              <label><span>Due date</span><input name="dueOn" type="date" /></label>
              <label><span>Note</span><textarea name="note" rows={3} maxLength={400} /></label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={() => { setCreating(false); setError(""); }}>Cancel</button>
              <button className="inv-new" type="submit" disabled={busy}>Create</button>
            </div>
          </form>
        </div>
      ) : null}

      {editing ? (
        <div className="modal-back inv-shade" onClick={() => { if (!busy) { setEditing(null); setError(""); } }}>
          <form className="modal dev-modal inv-dialog" onClick={(event) => event.stopPropagation()} onSubmit={saveBill}>
            <div className="dev-modal-head"><div><p className="inv-crumb">Invoices</p><h2>Edit invoice</h2></div></div>
            <div className="dev-modal-body">
              <label><span>Customer</span><input name="customerName" required minLength={2} maxLength={80} defaultValue={editing.customerName} /></label>
              <label><span>Email</span><input name="customerEmail" type="email" maxLength={120} defaultValue={editing.customerEmail ?? ""} /></label>
              <label><span>Title</span><input name="title" required minLength={2} maxLength={120} defaultValue={editing.title} /></label>
              <label><span>Total amount (BDT)</span><input name="total" type="number" min={1} step="0.01" required defaultValue={editing.total} /></label>
              <label><span>Due date</span><input name="dueOn" type="date" defaultValue={editing.dueOn ?? ""} /></label>
              <label>
                <span>Status</span>
                <select name="status" defaultValue={editing.status === "paid" || editing.status === "cancelled" ? editing.status : "due"}>
                  <option value="due">Due</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label><span>Note</span><textarea name="note" rows={3} maxLength={400} defaultValue={editing.note} /></label>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <div className="dev-modal-actions">
              <button className="btn-line" type="button" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
              <button className="inv-new" type="submit" disabled={busy}>Save</button>
            </div>
          </form>
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

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
function ColsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="5" width="3.2" height="14" rx="1" /><rect x="10.4" y="5" width="3.2" height="14" rx="1" /><rect x="16.8" y="5" width="3.2" height="14" rx="1" /></svg>;
}
function CrossIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 8l8 8M16 8l-8 8" /></svg>;
}
function LinkIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></svg>;
}
function PencilIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h4l10-10-4-4L4 16z" /><path d="m13 7 4 4" /></svg>;
}
