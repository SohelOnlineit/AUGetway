"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
type StatusView = "all" | "due" | "paid" | "cancelled";

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
  const [statusFilter, setStatusFilter] = useState<StatusView>("all");
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
      if (statusFilter !== "all" && statusOf(row.status).kind !== statusFilter) return false;
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
  }, [rows, query, sort, dir, statusFilter]);

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
  const counts = {
    all: rows.length,
    due: rows.filter((row) => statusOf(row.status).kind === "due").length,
    paid: rows.filter((row) => statusOf(row.status).kind === "paid").length,
    cancelled: rows.filter((row) => statusOf(row.status).kind === "cancelled").length,
  };

  function showStatus(next: StatusView) {
    setStatusFilter(next);
    setPage(1);
  }

  return (
    <div className="inv-page">
      <header className="inv-head">
        <div>
          <p className="inv-crumb">Desk <span>›</span> Invoices</p>
          <h2>Invoices</h2>
          <p className="muted">Bills you send from this desk, and whether they are still due.</p>
        </div>
        <div className="inv-head-actions">
          {picked.length ? (
            <button className="inv-drop" type="button" onClick={removePicked} disabled={busy}>Delete selected ({picked.length})</button>
          ) : null}
          <Link className="inv-new" href="/admin/invoices/create">New invoice</Link>
        </div>
      </header>
      {note ? <p className="inv-note">{note}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="inv-stats">
        <Stat label="Invoices" value={ready ? counts.all : "—"} on={statusFilter === "all"} onClick={() => showStatus("all")} />
        <Stat label="Due" value={ready ? counts.due : "—"} tone="due" on={statusFilter === "due"} onClick={() => showStatus("due")} />
        <Stat label="Paid" value={ready ? counts.paid : "—"} tone="paid" on={statusFilter === "paid"} onClick={() => showStatus("paid")} />
        <Stat label="Cancelled" value={ready ? counts.cancelled : "—"} tone="cancelled" on={statusFilter === "cancelled"} onClick={() => showStatus("cancelled")} />
      </div>

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
                      <Link className="inv-go" href={`/admin/invoices/${row.number}/edit`}>
                        <PencilIcon /> Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ready && !visible.length ? (
            <div className="inv-empty">
              <span className="inv-empty-mark" aria-hidden="true"><CrossIcon /></span>
              <strong>{query || statusFilter !== "all" ? "No matches" : "No invoices yet"}</strong>
              <p>{query || statusFilter !== "all" ? "Nothing in this list matches that view." : "Create the first invoice with the button above."}</p>
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

function Stat({ label, value, on, tone, onClick }: { label: string; value: number | string; on: boolean; tone?: string; onClick: () => void }) {
  return (
    <button type="button" className={on ? `inv-stat on${tone ? ` ${tone}` : ""}` : `inv-stat${tone ? ` ${tone}` : ""}`} onClick={onClick}>
      <strong>{value}</strong>
      <small>{label}</small>
    </button>
  );
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
